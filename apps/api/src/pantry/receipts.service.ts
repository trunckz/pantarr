// Receipts inbox: receipts and invoices given to Pantarr itself, for every household (self-hosted or hosted, with or
// without a document manager): photos and PDF sent from the Pantry page (or shared from the phone), mails of the
// mailbox connector, orders sent to an online store by the browser bridge. Each one is read into purchases:
// a store reader when one recognises the text (Intermarché), else the household's LLM (it reads photos and PDF),
// else the generic « label … price » reader. Re-reading a receipt replaces its purchases.
import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { LlmFile, Purchase } from "@pantarr/connector-sdk";
import { ConnectorsService } from "../connectors/connectors.service";
import { parseOrderMail, parseReceipt } from "../connectors/generic/generic.connectors";
import { parseIntermarche } from "../connectors/intermarche/intermarche.purchases";
import { decodeEntities, htmlText, mailboxConnector } from "../connectors/mailbox/mailbox.connector";
import { gmailConnector } from "../connectors/gmail/gmail.connector";
import { config } from "../config";
import { settingsOf } from "../households/households.defaults";
import { ocrImage, pdfText } from "./ocr";
import { AppError } from "../i18n/i18n";
import { JobsService } from "../jobs/jobs.service";
import { LlmService } from "../planning/llm.service";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif)|text\/(plain|html))$/i;
const today = () => new Date().toISOString().slice(0, 10);

/** Date written in a receipt (« 05/11/2026 », « 2026-11-05 », « 05.11.26 »), else null. */
export function dateIn(text: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // every « d/m/y » of the text (a phone number « 05.45.98.16.74 » comes first on a receipt): the valid ones, the one
  // next to a time (« 11:23:15 7/11/2026 ») first
  const found: { date: string; timed: boolean }[] = [];
  for (const fr of text.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})\b/g)) {
    const y = fr[3].length === 2 ? `20${fr[3]}` : fr[3], m = fr[2].padStart(2, "0"), d = fr[1].padStart(2, "0");
    if (!(+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31 && +y >= 2000 && +y <= 2099)) continue;
    const around = text.slice(Math.max(0, fr.index! - 12), fr.index! + fr[0].length + 12);
    found.push({ date: `${y}-${m}-${d}`, timed: /\d{1,2}:\d{2}/.test(around) });
  }
  return (found.find((x) => x.timed) ?? found[0])?.date ?? null;
}

const STORES: [RegExp, string][] = [[/intermarch/i, "Intermarché"], [/e\.?\s?leclerc|leclerc/i, "E.Leclerc"], [/carrefour/i, "Carrefour"], [/auchan/i, "Auchan"],
  [/\blidl\b/i, "Lidl"], [/\baldi\b/i, "Aldi"], [/hyper ?u\b|super ?u\b|u express|magasins u|coursesu/i, "Système U"], [/monoprix/i, "Monoprix"], [/franprix/i, "Franprix"],
  [/\bcasino\b/i, "Casino"], [/picard/i, "Picard"], [/biocoop/i, "Biocoop"], [/grand frais/i, "Grand Frais"], [/\bnetto\b/i, "Netto"], [/\bcora\b/i, "Cora"],
  [/chronodrive/i, "Chronodrive"], [/tesco/i, "Tesco"], [/sainsbury/i, "Sainsbury's"]];

/** Purchases of a receipt text without any LLM: the store's own reader (Intermarché), else the generic one. */
export function readText(text: string, date: string, externalId: string, byMail = false) {
  const store = STORES.find(([re]) => re.test(text))?.[1] ?? null;
  const online = byMail || /\b(drive|livraison|livré|commande n|order number|delivery)\b/i.test(text);
  // order mail of a drive (« name / packaging / xN / prices » blocks) first, then the store's receipt, then any receipt
  let lines: Purchase[] = parseOrderMail(text, date, store ?? "", externalId);
  if (!lines.length && store === "Intermarché") lines = parseIntermarche(text, date, externalId);
  if (!lines.length) {
    lines = parseReceipt(text, date, store ?? "", externalId);
    if (byMail && lines.length < 2) lines = [];   // one « label 1,99 » line in a mail: a balance, an offer, not a purchase
  }
  const channel: "in-store" | "online" = lines[0]?.channel === "online" || online ? "online" : "in-store";
  return { store, date, channel, lines: lines.map((p) => ({ ...p, channel, store: store ?? "", externalId })) };
}

/** Online order a mail belongs to: its number (« N° de commande 619531619 »), and which mail it is — the invoice (3)
 * gives the purchases really delivered, over « ready » (2) and « confirmed » (1). */
export function orderOf(text: string, store: string | null, subject: string): { key: string; rank: number } | null {
  const n = text.match(/n[°ºo]\.?\s*(?:de\s+)?commande\s*:?\s*(\d{6,})/i)?.[1] ?? text.match(/commande\s+(?:n[°ºo]\.?|num[ée]ro)\s*:?\s*(\d{6,})/i)?.[1];
  if (!n) return null;
  const head = `${subject}\n${text.slice(0, 600)}`;
  const rank = /factur|invoice/i.test(head) ? 3 : /pr[êe]te|pr[ée]par[ée]e|retir|livr[ée]e|ready/i.test(head) ? 2 : 1;
  return { key: `${(store ?? "").toLowerCase() || "?"}:${n}`, rank };
}

/** What the model is asked to read. */
export function receiptPrompt(locale: string, text?: string): string {
  const fr = locale === "fr";
  const body = fr
    ? `Voici un ticket de caisse, une facture ou une confirmation de commande de courses${text ? " (texte ci-dessous)" : " (fichier joint)"}. Extrais les articles achetés.
- « label » : le nom de l'article tel qu'écrit, abréviations développées (« S.HACHE » → « Steak haché »), sans le prix.
- « quantity » : le nombre d'unités achetées (2 pour « 2 x 1,50 »), « unit_price » le prix d'une unité, ou null.
- Ignore les totaux, sous-totaux, moyens de paiement, remises, points de fidélité, consignes, frais de service et de livraison.
- « channel » : « online » pour une commande drive ou livraison, sinon « in-store ».
- Si ce n'est pas un achat de courses (facture d'énergie, publicité…), « items » est vide.
Réponds uniquement en JSON : { "store": "enseigne ou null", "date": "AAAA-MM-JJ ou null", "channel": "in-store | online", "items": [{ "label": "…", "brand": "marque ou null", "quantity": 1, "unit_price": 1.99 }] }`
    : `Here is a receipt, an invoice or an order confirmation for groceries${text ? " (text below)" : " (file attached)"}. Extract the items bought.
- "label": the name of the item as written, abbreviations expanded, without the price.
- "quantity": the number of units bought (2 for "2 x 1.50"), "unit_price" the price of one unit, or null.
- Ignore totals, subtotals, payments, discounts, loyalty points, deposits, service and delivery fees.
- "channel": "online" for an online order or delivery, else "in-store".
- If it is not a grocery purchase (energy bill, advertising…), "items" is empty.
Answer only in JSON: { "store": "store or null", "date": "YYYY-MM-DD or null", "channel": "in-store | online", "items": [{ "label": "…", "brand": "brand or null", "quantity": 1, "unit_price": 1.99 }] }`;
  return text ? `${body}\n\n---\n${text.slice(0, 30000)}` : body;
}

/** The model's answer as purchases (the date of the receipt, else the given one). */
export function purchasesOf(json: unknown, fallbackDate: string, externalId: string): { store: string | null; date: string; channel: "in-store" | "online"; lines: Purchase[] } {
  const a = (json ?? {}) as { store?: unknown; date?: unknown; channel?: unknown; items?: unknown };
  const date = typeof a.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : fallbackDate;
  const channel = a.channel === "online" ? "online" : "in-store";
  const store = typeof a.store === "string" && a.store.trim() && a.store !== "null" ? a.store.trim() : null;
  const lines = (Array.isArray(a.items) ? a.items : []).filter((i) => i && typeof i.label === "string" && i.label.trim().length >= 2).map((i): Purchase => ({
    date, label: i.label.trim().slice(0, 120), brand: typeof i.brand === "string" && i.brand !== "null" ? i.brand : undefined,
    quantity: typeof i.quantity === "number" && i.quantity > 0 && i.quantity < 100 ? i.quantity : 1,
    unitPrice: typeof i.unit_price === "number" && i.unit_price >= 0 ? i.unit_price : undefined, store: store ?? "", channel, externalId }));
  return { store, date, channel, lines };
}

/** Days a receipt file is kept on a hosted instance. */
export const RECEIPT_DAYS = 30;

/** Key of a receipt of a purchase of the Intermarché account (its n-th slip). */
export const intermarcheKey = (transaction: string, n: number) => `intermarche:${transaction}:${n}`;

@Injectable()
export class ReceiptsService {
  private log = new Logger("receipts");
  constructor(private prisma: PrismaService, private ai: LlmService, private jobs: JobsService, private connectors: ConnectorsService) {}

  /** Intermarché receipts of the store account imported before 09/11 were dated the day they came (the date of the
   * account was not kept, the one of the text not found): dated again from their name and read again, once. */
  async onApplicationBootstrap() {
    setTimeout(() => this.jobs.exclusive("receipts-redate", 30, async () => {
      const rows = await this.prisma.receipt.findMany({ where: { source: "intermarche" }, select: { id: true, householdId: true, filename: true, date: true } });
      let n = 0;
      for (const r of rows) {
        const named = r.filename.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
        if (!named || r.date?.toISOString().slice(0, 10) === named) continue;
        await this.prisma.receipt.update({ where: { id: r.id }, data: { date: new Date(named) } });
        await this.read(r.id).catch((e) => this.log.warn(`${r.id}: ${(e as Error).message}`));
        n++;
      }
      if (n) this.log.log(`${n} Intermarché receipts dated again from the store account and read again`);
    }).catch(() => undefined), 20000);
  }

  /** A file given to the inbox ; the same file a second time is not read again. Read in the background. */
  async add(householdId: string, file: { filename: string; mimeType: string; data: Buffer }, source: "upload" | "email" | "gmail" | "order" | "intermarche", key?: string, date?: string) {
    if (!ACCEPTED.test(file.mimeType)) throw new AppError(400, "receipts.type");
    if (file.data.length > MAX_BYTES) throw new AppError(413, "receipts.tooBig");
    // the same file once ; a receipt of a store account: the same purchase of that account once (« key »)
    const hash = createHash("sha256").update(key ?? file.data).digest("hex");
    const old = await this.prisma.receipt.findUnique({ where: { householdId_hash: { householdId, hash } } });
    if (old) return { id: old.id, duplicate: true };
    const r = await this.prisma.receipt.create({ data: { householdId, source, filename: file.filename.slice(0, 200), mimeType: file.mimeType.toLowerCase(), data: new Uint8Array(file.data), hash,
      ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date: new Date(date) } : {}) } });
    await this.jobs.start("receipt", `receipt:${r.id}`, householdId, { receipt: r.id }, () => this.read(r.id));
    return { id: r.id, duplicate: false };
  }

  async list(householdId: string) {
    return this.prisma.receipt.findMany({ where: { householdId }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, source: true, filename: true, mimeType: true, status: true, error: true, store: true, date: true, channel: true, reader: true, purchases: true, createdAt: true } });
  }

  async file(householdId: string, id: string) {
    const r = await this.prisma.receipt.findFirst({ where: { id, householdId } });
    if (!r) throw new AppError(404, "receipts.notFound");
    return r;
  }

  /** Removes the receipt and its purchases ; the purchases of an order then come from its next best mail, if any. */
  async remove(householdId: string, id: string) {
    await this.file(householdId, id);
    const r = await this.prisma.receipt.findUniqueOrThrow({ where: { id } });
    await this.prisma.purchase.deleteMany({ where: { externalId: `receipt:${id}`, product: { householdId } } });
    if (r.orderKey && r.purchases > 0) await this.prisma.purchase.deleteMany({ where: { externalId: `order:${r.orderKey}`, product: { householdId } } });
    await this.prisma.receipt.delete({ where: { id } });
    if (r.orderKey && r.purchases > 0) {
      const next = await this.prisma.receipt.findFirst({ where: { householdId, orderKey: r.orderKey }, orderBy: [{ orderRank: "desc" }, { createdAt: "desc" }] });
      if (next) await this.read(next.id);
    }
    return { ok: true };
  }

  private locks = new Map<string, Promise<unknown>>();
  /** One at a time per key (the mails of one order are read together). */
  private locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const run = (this.locks.get(key) ?? Promise.resolve()).catch(() => undefined).then(fn);
    this.locks.set(key, run);
    void run.finally(() => { if (this.locks.get(key) === run) this.locks.delete(key); }).catch(() => undefined);
    return run;
  }

  /** The purchases of an online order, once for all its mails: from its highest mail (invoice > ready > confirmed). */
  private async saveOrder(householdId: string, id: string, order: { key: string; rank: number },
    found: { store: string | null; date: string; channel: "in-store" | "online"; lines: Purchase[] }, reader: string) {
    const meta = { store: found.store, date: new Date(found.date), channel: found.channel, reader, orderKey: order.key, orderRank: order.rank };
    const better = await this.prisma.receipt.findFirst({ where: { householdId, orderKey: order.key, id: { not: id }, status: "done", purchases: { gt: 0 }, orderRank: { gt: order.rank } } });
    if (better) {
      await this.prisma.receipt.update({ where: { id }, data: { ...meta, status: "done", error: "receipts.sameOrder", purchases: 0 } });
      return { purchases: 0, store: found.store };
    }
    await this.prisma.purchase.deleteMany({ where: { externalId: `receipt:${id}`, product: { householdId } } });   // read before orders were known
    const n = await this.save(householdId, `order:${order.key}`, found.lines, reader);
    await this.prisma.receipt.update({ where: { id }, data: { ...meta, status: n ? "done" : "empty", error: n ? null : "receipts.unreadable", purchases: n } });
    const others = await this.prisma.receipt.findMany({ where: { householdId, orderKey: order.key, id: { not: id } }, select: { id: true } });
    for (const o of others) {
      await this.prisma.purchase.deleteMany({ where: { externalId: `receipt:${o.id}`, product: { householdId } } });
      await this.prisma.receipt.update({ where: { id: o.id }, data: { status: "done", error: "receipts.sameOrder", purchases: 0 } });
    }
    return { purchases: n, store: found.store };
  }

  retry(householdId: string, id: string) {
    return this.jobs.start("receipt", `receipt:${id}`, householdId, { receipt: id }, async () => { await this.file(householdId, id); return this.read(id); });
  }

  /** Reads a receipt into purchases: text (mail, PDF text layer, OCR of a photo) and the store readers, the LLM when the
   * household allows it (setting « receiptReader »). */
  async read(id: string) {
    const r = await this.prisma.receipt.findUniqueOrThrow({ where: { id }, include: { household: true } });
    // Mails read from Gmail through Google's API: never sent to the LLM (Google's « Limited Use » rules), text only
    const externalId = `receipt:${r.id}`, locale = r.household.locale, mode = r.source === "gmail" || config.mode === "hosted" ? "ocr" : settingsOf(r.household).receiptReader;
    const bytes = Buffer.from(r.data);
    if (!bytes.length) throw new AppError(410, "receipts.purged");   // file removed after its retention time (hosted)
    try {
      let text = "", textReader = "text";
      if (r.mimeType === "text/html") text = htmlText(bytes.toString("utf8"));
      else if (r.mimeType.startsWith("text/")) text = decodeEntities(bytes.toString("utf8"));   // mails saved before the full decoding
      else if (r.mimeType === "application/pdf") { text = await pdfText(bytes).catch(() => ""); textReader = "pdf"; }
      else if (mode !== "llm") { text = await ocrImage(bytes, locale); textReader = "ocr"; }
      // the date the store account gave (Intermarché receipts), else the one written, else the day it came
      const given = r.source === "intermarche" && r.date ? r.date.toISOString().slice(0, 10) : null;
      const fallbackDate = given || dateIn(text) || r.createdAt.toISOString().slice(0, 10);
      let found: { store: string | null; date: string; channel: "in-store" | "online"; lines: Purchase[] } | null = null, reader = "";
      if (mode !== "llm" && text.trim().length > 30) {
        found = readText(text, fallbackDate, externalId, r.source === "email" || r.source === "gmail");
        reader = found.lines.length && /intermarch/i.test(text) ? "intermarche" : textReader;
        if (found.lines.length < 2 && mode === "ocr-llm") found = null;
      }
      if (!found && mode !== "ocr") {
        const files: LlmFile[] | undefined = r.mimeType.startsWith("text/") ? undefined : [{ mimeType: r.mimeType, data: bytes.toString("base64"), name: r.filename }];
        found = purchasesOf(await this.ai.complete(r.householdId, locale, "receipt", receiptPrompt(locale, files ? undefined : text), files), fallbackDate, externalId);
        reader = "llm";
      }
      if (!found) {   // OCR only and nothing readable: a scanned PDF, a blurred photo
        await this.prisma.receipt.update({ where: { id }, data: { status: "empty", reader: textReader, purchases: 0,
          error: r.mimeType === "application/pdf" && !text.trim() ? "receipts.scannedPdf" : "receipts.unreadable" } });
        return { purchases: 0, store: null };
      }
      const order = r.source === "upload" ? null : orderOf(text, found.store, r.filename);
      if (!order) {
        const n = await this.save(r.householdId, externalId, found.lines, reader);
        await this.prisma.receipt.update({ where: { id }, data: { status: n ? "done" : "empty", error: n ? null : "receipts.unreadable", store: found.store,
          date: new Date(found.date), channel: found.channel, reader, purchases: n } });
        return { purchases: n, store: found.store };
      }
      const f = found;
      return this.locked(`${r.householdId}|${order.key}`, () => this.saveOrder(r.householdId, id, order, f, reader));
    } catch (e) {
      const message = String((e as { key?: string }).key ?? (e as Error).message).slice(0, 300);
      await this.prisma.receipt.update({ where: { id }, data: { status: "failed", error: message } });
      throw e;
    }
  }

  /** Purchases of a receipt (or an order), those read before replaced. */
  async save(householdId: string, externalId: string, lines: Purchase[], connector: string) {
    await this.prisma.purchase.deleteMany({ where: { externalId, product: { householdId } } });
    for (const p of lines) {
      const where = { householdId_connector_label: { householdId, connector: `receipts-${connector}`, label: p.label } };
      // two receipts read at the same time may create the same product: the second one takes it
      const product = await this.prisma.product.upsert({ where, create: { householdId, connector: `receipts-${connector}`, label: p.label, brand: p.brand, channel: p.channel }, update: {} })
        .catch(async (e: { code?: string }) => { if (e.code !== "P2002") throw e; return this.prisma.product.findUniqueOrThrow({ where }); });
      await this.prisma.purchase.create({ data: { productId: product.id, date: new Date(p.date), quantity: p.quantity, unitPrice: p.unitPrice, externalId } });
    }
    return lines.length;
  }

  /** An order sent to an online store by the browser bridge: kept as a receipt (its text), its products bought today. */
  async order(householdId: string, store: string, items: { name: string; quantity: number; price?: number | null }[]) {
    const date = today(), kept = items.filter((i) => i.name.trim());
    const text = `${store} — ${date}\n` + kept.map((i) => `${i.quantity} x ${i.name.trim()}${typeof i.price === "number" ? ` ${i.price}` : ""}`).join("\n");
    const data = Buffer.from(text, "utf8");
    const r = await this.prisma.receipt.create({ data: { householdId, source: "order", filename: `${store} ${date}.txt`, mimeType: "text/plain", data: new Uint8Array(data),
      hash: createHash("sha256").update(data).update(String(Date.now())).digest("hex"), status: "done", store, date: new Date(date), channel: "online", reader: "order" } });
    const externalId = `receipt:${r.id}`;
    const n = await this.save(householdId, externalId, kept.map((i) => ({ date, label: i.name.trim().slice(0, 120), quantity: i.quantity > 0 ? i.quantity : 1,
      unitPrice: typeof i.price === "number" ? i.price : undefined, store, channel: "online" as const, externalId })), "order");
    await this.prisma.receipt.update({ where: { id: r.id }, data: { purchases: n } });
    return { purchases: n };
  }

  /** Lidl Plus receipts not imported yet (a receipt is known by the hash of its Lidl id). */
  // ── Intermarché in-store receipts of the customer account (browser extension) ──
  /** Which purchases of the account Pantarr does not have: not received yet, not noted as without a receipt, and more
   * recent than the last in-store Intermarché purchase already known (from Paperless or a mail: never twice). */
  async unknownIntermarche(householdId: string, transactions: { id: string; date: string }[]) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    const empty = new Set((h.settings as { intermarcheEmpty?: string[] }).intermarcheEmpty ?? []);
    const last = await this.prisma.purchase.findFirst({ where: { product: { householdId, channel: "in-store", connector: { in: ["intermarche-purchases", "receipts-intermarche"] } } },
      orderBy: { date: "desc" }, select: { date: true } });
    const since = last?.date.toISOString().slice(0, 10) ?? "";
    const keys = new Map(transactions.map((t) => [createHash("sha256").update(intermarcheKey(t.id, 0)).digest("hex"), t.id]));
    const have = new Set((await this.prisma.receipt.findMany({ where: { householdId, hash: { in: [...keys.keys()] } }, select: { hash: true } })).map((r) => keys.get(r.hash)));
    return transactions.filter((t) => !have.has(t.id) && !empty.has(t.id) && (!since || !t.date || t.date > since)).map((t) => t.id);
  }

  /** A receipt (PDF) of a purchase of the account, read like any receipt. */
  async addIntermarche(householdId: string, t: { transaction: string; date: string; n: number }, data: Buffer) {
    return this.add(householdId, { filename: `Intermarché ${t.date}${t.n ? ` (${t.n + 1})` : ""}.pdf`, mimeType: "application/pdf", data }, "intermarche",
      intermarcheKey(t.transaction, t.n), t.date);
  }

  /** A purchase with only the bank card slip: not asked again (the last 300 kept). */
  async noReceiptIntermarche(householdId: string, id: string) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    const list = [...new Set([...((h.settings as { intermarcheEmpty?: string[] }).intermarcheEmpty ?? []), id])].slice(-300);
    await this.prisma.household.update({ where: { id: householdId }, data: { settings: { ...(h.settings as object), intermarcheEmpty: list } as Prisma.InputJsonValue } });
    return { ok: true };
  }

  async unknownLidl(householdId: string, ids: string[]) {
    const hashes = new Map(ids.map((id) => [createHash("sha256").update(`lidl:${id}`).digest("hex"), id]));
    const known = await this.prisma.receipt.findMany({ where: { householdId, hash: { in: [...hashes.keys()] } }, select: { hash: true } });
    const seen = new Set(known.map((k) => k.hash));
    return [...hashes.entries()].filter(([h]) => !seen.has(h)).map(([, id]) => id);
  }

  /** Lidl Plus receipts (items read from the printed receipt by the browser script), each kept with its printed HTML. */
  async importLidl(householdId: string, receipts: { id: string; date: string; store?: string; html?: string; items: { name: string; quantity: number; unitPrice?: number | null; discount?: number }[] }[]) {
    let added = 0;
    for (const t of receipts) {
      const hash = createHash("sha256").update(`lidl:${t.id}`).digest("hex");
      if (await this.prisma.receipt.findUnique({ where: { householdId_hash: { householdId, hash } } })) continue;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : today(), store = `Lidl${t.store ? ` ${t.store}` : ""}`.slice(0, 120);
      const data = Buffer.from(t.html || t.items.map((i) => `${i.quantity} x ${i.name} ${i.unitPrice ?? ""}`).join("\n"), "utf8");
      const r = await this.prisma.receipt.create({ data: { householdId, source: "lidl", filename: `Lidl ${date}.html`, mimeType: t.html ? "text/html" : "text/plain",
        data: new Uint8Array(data), hash, status: "done", store, date: new Date(date), channel: "in-store", reader: "lidl" } });
      const externalId = `receipt:${r.id}`;
      const n = await this.save(householdId, externalId, t.items.filter((i) => i.name.trim()).map((i) => ({ date, label: i.name.trim().slice(0, 120),
        quantity: i.quantity > 0 ? i.quantity : 1, unitPrice: typeof i.unitPrice === "number" ? i.unitPrice : undefined, store: "Lidl", channel: "in-store" as const, externalId })), "lidl");
      await this.prisma.receipt.update({ where: { id: r.id }, data: { purchases: n, status: n ? "done" : "empty" } });
      added++;
    }
    return { added };
  }

  /** New mails of the mail connectors (Gmail, IMAP mailbox) into the inbox ; « full »: the last 90 days again (mails
   * already there are not added twice). A mail without attachment whose text has no article (advertising, delivery
   * slot…) is left out. */
  async checkMailbox(householdId: string, full = false) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    let mails = 0, added = 0, skipped = 0, any = false;
    for (const [id, connector] of [["gmail", gmailConnector], ["mailbox", mailboxConnector]] as const) {
      const ctx = await this.connectors.context(householdId, id, h.locale);
      if (!ctx) continue;
      any = true;
      const { documents, cursor } = await connector.messages(full ? { ...ctx, settings: { ...ctx.settings, cursor: "" } } : ctx, full ? 200 : 40);
      for (const d of documents) {
        if (d.mimeType === "text/plain" && !readText(decodeEntities(d.data.toString("utf8")), today(), "check", true).lines.length) { skipped++; continue; }
        try { if (!(await this.add(householdId, { filename: d.filename, mimeType: d.mimeType, data: d.data }, id === "gmail" ? "gmail" : "email")).duplicate) added++; }
        catch (e) { this.log.warn(`${householdId} ${id} ${d.uid}: ${(e as Error).message}`); }
      }
      mails += documents.length;
      // reading again from the start never moves Gmail's cursor back (time of the last mail read)
      const keep = full && id === "gmail" && Number(ctx.settings.cursor || 0) > Number(cursor || 0);
      if (!keep) await this.connectors.saveSecrets(householdId, id, { cursor });
    }
    if (!any) throw new AppError(409, "receipts.noMailbox");
    return { mails, added, skipped };
  }

  /** Hosted: the files of the receipts are kept 30 days (to read them again with a better reader), then removed ; only
   * the purchase lines stay (data minimisation, privacy policy). The hash stays, so the same file is not taken twice. */
  @Cron("43 3 * * *")
  async purgeFiles() {
    if (config.mode !== "hosted") return;
    await this.jobs.exclusive("receipt-files", 30, async () => {
      const n = await this.prisma.$executeRaw`UPDATE "Receipt" SET data = decode('', 'hex') WHERE "createdAt" < ${new Date(Date.now() - RECEIPT_DAYS * 864e5)} AND status <> 'pending' AND octet_length(data) > 0`;
      if (n) this.log.log(`${n} receipt files removed after ${RECEIPT_DAYS} days`);
    });
  }

  @Cron("17 * * * *")
  async hourly() {
    await this.jobs.exclusive("mailboxes", 55, async () => {   // one server at a time
      const rows = await this.prisma.connectorInstance.findMany({ where: { moduleId: { in: ["mailbox", "gmail"] }, enabled: true, householdId: { not: null } } });
      for (const c of rows.filter((r, i) => rows.findIndex((x) => x.householdId === r.householdId) === i)) {
        try { const r = await this.checkMailbox(c.householdId!); if (r.added) this.log.log(`${c.householdId}: ${r.added} receipts from the mailbox`); }
        catch (e) { this.log.warn(`${c.householdId} mailbox: ${(e as Error).message}`); }
      }
    });
  }
}
