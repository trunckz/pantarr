// Gmail, through « Connect with Google »: the mails of the stores (order confirmations, digital receipts, invoices) go
// to the receipts inbox, like the IMAP mailbox connector but without app password nor server settings. Only the mails
// of the senders listed are read (a Gmail search, « from:(leclerc OR intermarche …) »), new ones every hour, the last
// 90 days the first time.
import type { ConnectorContext, ConnectorManifest } from "@pantarr/connector-sdk";
import { documentsOf, type MailDocument } from "../mailbox/mailbox.connector";
import { apiCall } from "../oauth/oauth";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
export const STORE_SENDERS = "leclerc, intermarche, carrefour, auchan, coursesu, magasins-u, systeme-u, chronodrive, monoprix, franprix, lidl, aldi, picard, " +
  "casino, cora, grandfrais, biocoop, naturalia, lagrandeepicerie, houra, amazon";

const words = (s: unknown) => String(s ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Gmail search of the new mails of the stores (after the last one read, else the last 90 days). */
export function gmailQuery(senders: string[], afterMs: number): string {
  const from = senders.length ? `from:(${senders.map((w) => w.replace(/[()"\s]/g, "")).join(" OR ")})` : "";
  const when = afterMs ? `after:${Math.floor(afterMs / 1000)}` : "newer_than:90d";
  return [from, when, "-in:chats"].filter(Boolean).join(" ");
}

const gmail = <T>(ctx: ConnectorContext, path: string) => apiCall<T>(ctx, "google", "gmail", `${GMAIL}${path}`);

export const gmailConnector = {
  manifest: { id: "gmail", kind: "documents", name: "Gmail: receipts and invoices of the stores", oauth: "google",
    description: "« Connect with Google », that's all: the mails of your stores (drive orders, digital receipts, invoices) land in the receipts of the Pantry page. Only these senders are read.",
    settings: {
      clientId: { type: "string", title: "Client ID", required: true },
      clientSecret: { type: "string", title: "Client secret", secret: true, required: true },
      refreshToken: { type: "string", title: "Refresh token", secret: true, hidden: true },
      senders: { type: "string", title: "Stores read (words of the sender's address, comma separated)", default: STORE_SENDERS },
      cursor: { type: "string", title: "Last mail read", secret: true, hidden: true },
    } } as ConnectorManifest,

  /** New mails of the stores since the last reading, at most « limit » (oldest first, so the cursor moves forward). */
  async messages(ctx: ConnectorContext, limit = 40): Promise<{ documents: MailDocument[]; cursor: string }> {
    const senders = words(ctx.settings.senders || STORE_SENDERS);
    const after = Number(ctx.settings.cursor || 0);
    const ids: string[] = [];
    let page = "";
    do {
      const q = new URLSearchParams({ q: gmailQuery(senders, after), maxResults: "100", ...(page ? { pageToken: page } : {}) });
      const r = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(ctx, `/messages?${q}`);
      ids.push(...(r.messages ?? []).map((m) => m.id));
      page = r.nextPageToken ?? "";
    } while (page && ids.length < 500);
    // Gmail lists the newest first: read the oldest ones first
    const out: MailDocument[] = [];
    let max = after;
    for (const [n, id] of ids.reverse().slice(0, limit).entries()) {
      const m = await gmail<{ raw: string; internalDate: string }>(ctx, `/messages/${id}?format=raw`);
      max = Math.max(max, Number(m.internalDate) || 0);
      out.push(...(await documentsOf(Buffer.from(m.raw, "base64url"), n + 1, senders)));
    }
    return { documents: out, cursor: String(max) };
  },

  async test(ctx: ConnectorContext) {
    const me = await gmail<{ emailAddress: string }>(ctx, "/profile");
    const q = new URLSearchParams({ q: gmailQuery(words(ctx.settings.senders || STORE_SENDERS), 0), maxResults: "100" });
    const r = await gmail<{ resultSizeEstimate?: number; messages?: unknown[] }>(ctx, `/messages?${q}`);
    return `${me.emailAddress}: ${r.messages?.length ?? 0} mails of stores in the last 90 days`;
  },
};
