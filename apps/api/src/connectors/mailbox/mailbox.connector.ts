// Mailbox (IMAP): the receipts and invoices of the stores arrive by e-mail (online orders, digital receipts). Pantarr
// reads one folder (e.g. « Pantarr », where a mail filter or the user puts them, or the inbox with a sender filter)
// and gives each PDF / photo attached, or the mail itself when it has none, to the receipts inbox. Works without a
// document manager, self-hosted or hosted (in hosted mode, only public mail servers).
import { lookup } from "node:dns/promises";
import type { ConnectorContext, ConnectorManifest } from "@pantarr/connector-sdk";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config } from "../../config";
import { isPrivate } from "../../hosted/safe-fetch";

export interface MailDocument { uid: number; filename: string; mimeType: string; data: Buffer; subject: string; from: string; date: Date }

const words = (s: unknown) => String(s ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const KEEP = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i;

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", euro: "€", deg: "°", times: "×", laquo: "«", raquo: "»",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", middot: "·", copy: "©", reg: "®", trade: "™", oelig: "œ", OElig: "Œ",
  aelig: "æ", szlig: "ß", ccedil: "ç", Ccedil: "Ç" };
const ACCENTS: Record<string, string> = { grave: "\u0300", acute: "\u0301", circ: "\u0302", tilde: "\u0303", uml: "\u0308", ring: "\u030a" };

/** HTML character references as text: « &eacute; », « &#233; », « &#xE9; »… */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all; }
    if (e in ENTITIES) return ENTITIES[e];
    const m = e.match(/^([a-z])(grave|acute|circ|tilde|uml|ring)$/i);   // « eacute » → é
    return m ? (m[1] + ACCENTS[m[2]]).normalize("NFC") : all;
  });
}

/** The HTML of a mail as plain text (online order confirmations often have no attachment). */
export function htmlText(html: string): string {
  return decodeEntities(html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<\/t[dh]>/gi, "  ")
    .replace(/<[^>]+>/g, " ")).replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
}

/** Documents of one raw mail: its PDF and photos attached, else the mail itself as text (« senders »: words that one of
 * them must have in its address, nothing kept otherwise). */
export async function documentsOf(source: Buffer, uid: number, senders: string[] = []): Promise<MailDocument[]> {
  const mail = await simpleParser(source);
  const from = mail.from?.text ?? "";
  // accents ignored, as Gmail's search does: « Intermarché <…@mousquetaires.com> » is an « intermarche » mail
  const plain = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (senders.length && !senders.some((w) => plain(from).includes(plain(w)))) return [];
  const base = { uid, subject: mail.subject ?? "", from, date: mail.date ?? new Date() };
  const files = (mail.attachments ?? []).filter((a) => KEEP.test(a.contentType) && a.size > 2000);
  const out: MailDocument[] = files.map((a) => ({ ...base, filename: a.filename ?? `mail-${uid}`, mimeType: a.contentType, data: a.content }));
  if (!files.length && (mail.html || mail.text)) {
    const text = mail.html ? htmlText(String(mail.html)) : String(mail.text);
    out.push({ ...base, filename: `${(mail.subject ?? "mail").slice(0, 80)}.txt`, mimeType: "text/plain",
      data: Buffer.from(`${mail.subject ?? ""}\n${from}\n${mail.date?.toISOString().slice(0, 10) ?? ""}\n\n${text}`, "utf8") });
  }
  return out;
}

async function client(ctx: ConnectorContext): Promise<ImapFlow> {
  const host = String(ctx.settings.host ?? "").trim();
  if (!host) throw new Error("IMAP server missing");
  if (config.mode === "hosted") {   // no private network from the platform (SSRF)
    const ips = await lookup(host, { all: true });
    if (!ips.length || ips.some((x) => isPrivate(x.address))) throw new Error("private address refused");
  }
  const c = new ImapFlow({ host, port: Number(ctx.settings.port || 993), secure: ctx.settings.tls !== false, logger: false,
    auth: { user: String(ctx.settings.username ?? ""), pass: String(ctx.settings.password ?? "") } });
  await c.connect();
  return c;
}

export const mailboxConnector = {
  manifest: { id: "mailbox", kind: "documents", name: "Mailbox (IMAP): receipts and invoices by e-mail",
    description: "Reads one folder of a mailbox: PDF and photos attached, or the mail itself (online orders), go to the receipts of the Pantry page. No document manager needed.",
    settings: {
      host: { type: "string", title: "IMAP server (e.g. imap.gmail.com)", required: true },
      port: { type: "number", title: "Port", default: 993 },
      tls: { type: "boolean", title: "TLS", default: true },
      username: { type: "string", title: "User name (address)", required: true },
      password: { type: "string", title: "Password (app password)", secret: true, required: true },
      folder: { type: "string", title: "Folder (label)", default: "Pantarr", required: true },
      senders: { type: "string", title: "Only from these senders (words of the address, comma separated; empty = all)", default: "" },
      cursor: { type: "string", title: "Last mail read", secret: true, hidden: true },
    } } as ConnectorManifest,

  /** New mails of the folder since the last reading (the last 90 days the first time), at most « limit ». */
  async messages(ctx: ConnectorContext, limit = 40): Promise<{ documents: MailDocument[]; cursor: string }> {
    const c = await client(ctx);
    const out: MailDocument[] = [];
    const folder = String(ctx.settings.folder || "INBOX");
    let cursor = String(ctx.settings.cursor ?? "");
    try {
      const box = await c.mailboxOpen(folder, { readOnly: true });
      const [validity, last] = cursor.split(":");
      const fresh = validity !== String(box.uidValidity);   // folder recreated: read again from the date
      const query = fresh ? { since: new Date(Date.now() - 90 * 864e5) } : { uid: `${Number(last) + 1}:*` };
      const uids = ((await c.search(query, { uid: true })) || []).filter((u) => fresh || u > Number(last)).sort((a, b) => a - b).slice(0, limit);
      const senders = words(ctx.settings.senders);
      let max = fresh ? 0 : Number(last);
      for (const uid of uids) {
        max = Math.max(max, uid);
        const m = await c.fetchOne(String(uid), { source: true }, { uid: true });
        if (!m || !m.source) continue;
        out.push(...(await documentsOf(m.source, uid, senders)));
      }
      cursor = `${box.uidValidity}:${max}`;
    } finally { await c.logout().catch(() => undefined); }
    return { documents: out, cursor };
  },

  async test(ctx: ConnectorContext) {
    const c = await client(ctx);
    try {
      const folder = String(ctx.settings.folder || "INBOX");
      const s = await c.status(folder, { messages: true });
      return `« ${folder} »: ${s.messages ?? 0} mails`;
    } finally { await c.logout().catch(() => undefined); }
  },
};
