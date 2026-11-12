// Store-agnostic connectors: a receipt reader for any store whose receipts are archived in the document manager
// (« LABEL … 1,99 » lines until the total), and Grocy (inventory: what is really in the cupboards wins over the
// estimate). Store-specific connectors (Intermarché…) read better; this one makes any store usable on day one.
import type { ConnectorContext, InventoryConnector, Purchase, PurchasesConnector, StockLevel } from "@pantarr/connector-sdk";

// « BEURRE DOUX 250G   2,98 € A » / « Milk 2L 1.89 » / « 2 x 1,50   3,00 »
const LINE = /^(?<label>[^\d\s*].{1,60}?)\s+(?<price>-?\d{1,4}[.,]\d{2})\s*(?:€|EUR|E)?(?:\s+[A-Z0-9]{1,2})?$/i;
const QUANTITY = /^(?<n>\d{1,3})\s*[xX*]\s*(?<unit>\d{1,4}[.,]\d{2})/;
const STOP = /^(sous[- ]*total|total|montant|net a payer|net à payer|a payer|à payer|subtotal|amount due|balance due)\b/i;
const SKIP = /^(cb|carte|visa|mastercard|especes|espèces|rendu|a rendre|tva|vat|tax|remise|reduction|réduction|bon |avoir|fidelite|fidélité|points|change|cash|card|mon solde|solde|cagnotte|economies|économies)\b/i;
const price = (s: string) => parseFloat(s.replace(",", "."));

/** Purchases of a receipt text: one per article line, « n x price » lines giving the quantity of the next article. */
export function parseReceipt(text: string, date: string, store: string, externalId: string): Purchase[] {
  const out: Purchase[] = [];
  let quantity = 1;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim().replace(/^[*•+]+\s*/, "");   // « *HAR.MEGAFETE » : a promotion mark
    if (STOP.test(line)) break;
    const q = line.match(QUANTITY);
    if (q?.groups && line.length < 30) { quantity = +q.groups.n; continue; }
    const m = line.match(LINE);
    if (!m?.groups || SKIP.test(m.groups.label) || price(m.groups.price) <= 0) continue;
    const label = m.groups.label.replace(/[.\s]+$/, "").trim();
    if (!/[a-z]{3}/i.test(label)) continue;
    out.push({ date, label, quantity, unitPrice: Math.round(price(m.groups.price) / quantity * 100) / 100, store, channel: "in-store", externalId });
    quantity = 1;
  }
  return out;
}

// Order mails of the online stores (drive): one article on several lines — name, packaging, « x2 », unit price, total
// (Intermarché, and the same layout elsewhere). « x2 » is the anchor: the name is the first of the lines before it.
const TIMES = /^[x×]\s?(\d{1,3})$/i;
const AMOUNT = /^-?\d{1,4}[.,]\d{2}\s*(?:€|EUR)?$/i;
const NOT_NAME = /^(quantit|prix|total|ttc|r[ée]capitulatif|\d+ produits?)/i;

/** Purchases of an order mail whose articles are « name / packaging / xN / unit price / total » blocks. */
export function parseOrderMail(text: string, date: string, store: string, externalId: string): Purchase[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: Purchase[] = [];
  let last = -1;   // end of the previous article: its lines are not the next one's name
  for (let i = 0; i < lines.length; i++) {
    const q = lines[i].match(TIMES);
    if (!q) continue;
    // name and packaging: the text lines just before « xN », after the previous article's prices
    const before: string[] = [];
    for (let k = i - 1; k > last && before.length < 3; k--) {
      if (AMOUNT.test(lines[k]) || TIMES.test(lines[k]) || NOT_NAME.test(lines[k])) break;
      before.unshift(lines[k]);
    }
    let j = i + 1;
    const prices: number[] = [];
    while (j < lines.length && prices.length < 2 && AMOUNT.test(lines[j])) { prices.push(price(lines[j])); j++; }
    last = j - 1;
    if (!before.length || !prices.length || prices[0] <= 0) continue;
    const name = before[0];
    const packaging = before.length > 1 ? before.slice(1).join(" ") : "";
    out.push({ date, label: (packaging ? `${name} (${packaging.replace(/^(les|le|la|l')\s*/i, "")})` : name).slice(0, 120), quantity: +q[1],
      unitPrice: prices[0], store, channel: "online", externalId });
  }
  return out;
}

export const genericReceipts: PurchasesConnector & { test(ctx: ConnectorContext): Promise<string> } = {
  manifest: { id: "generic-receipts", kind: "purchases", name: "Receipts of any store (generic reader)",
    description: "Reads the receipts of the given stores in the document manager: one article per « label … price » line, until the total. Store-specific connectors read better when there is one.",
    settings: { correspondent: { type: "string", title: "Stores (correspondents in the document manager, comma separated)", required: true },
      channel: { type: "string", title: "Bought in store or online (in-store | online)", default: "in-store" } } },
  parse(ctx, raw) {
    const doc = JSON.parse(raw.text) as { id: string; created: string; content: string; correspondent?: string };
    return parseReceipt(doc.content, doc.created.slice(0, 10), doc.correspondent ?? "", `doc:${doc.id}`)
      .map((p) => ({ ...p, channel: ctx.settings.channel === "online" ? "online" as const : "in-store" as const }));
  },
  async test(ctx) { return `stores: ${String(ctx.settings.correspondent ?? "")}`; },
};

// ── Grocy ──
export const grocyConnector: InventoryConnector & { test(ctx: ConnectorContext): Promise<string> } = {
  manifest: { id: "grocy", kind: "inventory", name: "Grocy",
    description: "What Grocy has in stock wins over the estimate: a family with stock is « ok », at or below Grocy's minimum it is « to buy ».",
    settings: { url: { type: "url", title: "Grocy URL", required: true }, apiKey: { type: "string", title: "API key (Grocy → Manage API keys)", secret: true, required: true } } },
  async stock(ctx) {
    const base = String(ctx.settings.url).replace(/\/$/, "");
    const get = async <T>(path: string): Promise<T> => {
      const r = await ctx.fetch(`${base}/api${path}`, { headers: { "GROCY-API-KEY": String(ctx.settings.apiKey), Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`Grocy ${r.status}`);
      return r.json() as Promise<T>;
    };
    const [stock, products] = await Promise.all([
      get<{ product_id: number; amount: string | number }[]>("/stock"),
      get<{ id: number; name: string; min_stock_amount: string | number }[]>("/objects/products"),
    ]);
    const amount = new Map(stock.map((s) => [s.product_id, Number(s.amount)]));
    // Every product, in stock or not (a product at 0 below its minimum is « to buy »)
    return products.map((p): StockLevel => ({ product: p.name, quantity: amount.get(p.id) ?? 0, minimum: Number(p.min_stock_amount) || 0 }));
  },
  async test(ctx) { const s = await this.stock(ctx); return `${s.length} products, ${s.filter((x) => x.quantity > 0).length} in stock`; },
};
