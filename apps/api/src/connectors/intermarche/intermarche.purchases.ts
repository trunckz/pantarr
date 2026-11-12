// Intermarché purchases (France): the drive invoices and the in-store receipts, read from their text (archived in a
// document manager, or sent by the browser bridge in phase 5). Store-specific formats and till abbreviations stay
// here, the core only sees normalised purchases.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConnectorContext, Purchase, PurchasesConnector } from "@pantarr/connector-sdk";

// Drive invoice: « MONTFLEURI - Beurre doux 60% MG, la plaquette de 250g 1 1 5,50 % 1,86 € 1,96 € 1,96 € »
const INVOICE_LINE = /^(?<label>.+?) (?<ordered>\d+) (?<delivered>\d+) \d+,\d+ % [\d ]+,\d+ € (?<price>[\d ]+,\d+) € [\d ]+,\d+ €\s*$/;
// In-store receipt: « SURGERES BEURRE DOUX 2,98 EUR A », one line per unit, until « MONTANT DU »
const RECEIPT_LINE = /^\*?(?<label>[A-Z0-9][^\n]{2,}?) (?<price>\d+,\d{2}) EUR [A-Z]$/;
const NOT_ARTICLE = /^(MONTANT|TOTAL|SOUS[- ]*TOTAL|CB |TRD|ESPECES|A RENDRE|REMISE)/;

/** Till abbreviations (20 characters per line) expanded so that the products can be recognised. */
const ABBREVIATIONS: [RegExp, string][] = [
  [/\bS\.? ?HACHE/g, "STEAK HACHE"], [/\bCCHES?\b/g, "COUCHES"], [/\bMINER\.?(?=\s|$)/g, "MINERALE"], [/\bDX\b/g, "DOUX"],
  [/\bPT\b/g, "PETIT"], [/\bSPE\b/g, "SPECIAL"], [/\bBQ\b/g, "BARQUETTE"], [/\bFRAIS\b/g, "FRAIS"],
];
export const expand = (label: string) => ABBREVIATIONS.reduce((s, [a, b]) => s.replace(a, b), label);

const price = (s: string) => parseFloat(s.replace(/\s/g, "").replace(",", "."));

/** « MARQUE - Description, la bouteille de 75 cl » → « MARQUE - Description » (formats of one product grouped). */
export function invoiceLabel(raw: string): { label: string; brand: string } {
  const [brand, ...rest] = raw.replace(/\s+/g, " ").trim().split(" - ");
  const description = rest.join(" - ").replace(/,\s*(la|le|les|l'|un|une|\d{4}\b|x ?\d).*$/i, "").trim().replace(/,$/, "");
  return { label: `${brand} - ${description}`, brand: brand.replace(/, UNE MARQUE INTERMARCH[ÉE]/i, "") };
}

export function parseIntermarche(text: string, date: string, externalId: string): Purchase[] {
  const out: Purchase[] = [];
  if (/articles vendus/i.test(text)) {   // in-store receipt
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith("MONTANT DU")) break;
      const m = line.match(RECEIPT_LINE);
      if (!m?.groups || NOT_ARTICLE.test(m.groups.label)) continue;
      const label = expand(m.groups.label.replace(/\s+/g, " ").trim());
      out.push({ date, label, brand: label.split(" ")[0], quantity: 1, unitPrice: price(m.groups.price), store: "Intermarché", channel: "in-store", externalId });
    }
    return out;
  }
  for (const raw of text.split(/\r?\n/)) {   // drive invoice
    const m = raw.trim().match(INVOICE_LINE);
    if (!m?.groups || !m.groups.label.includes(" - ")) continue;
    const { label, brand } = invoiceLabel(m.groups.label);
    out.push({ date, label, brand, quantity: +m.groups.delivered, unitPrice: price(m.groups.price), store: "Intermarché", channel: "online", externalId });
  }
  return out;
}

/** The browser part (« bridgeScript ») gets the bridge configuration like the store carts, not a connector context. */
export const intermarchePurchases: Omit<PurchasesConnector, "bridgeScript"> & { bridgeScript(c: { api: string; key: string; version: string; household?: string }): string } = {
  manifest: {
    id: "intermarche-purchases", kind: "purchases", name: "Intermarché — purchases", countries: ["FR"], bridge: true,
    origins: ["https://www.intermarche.com"], siteUrl: "https://www.intermarche.com/",
    description: "Drive invoices and in-store receipts: the browser extension sends the new receipts of your Intermarché account when you visit the site signed in ; also read from the documents connector (Paperless).",
    settings: { correspondent: { type: "string", title: "Correspondent of the documents", default: "Intermarché" } },
  },
  /** In-store receipts of the customer account, sent by the browser (extension or userscript). */
  bridgeScript({ api, key, version, household }: { api: string; key: string; version: string; household?: string }) {
    return readFileSync(join(__dirname, "tickets.user.js"), "utf8")
      .replaceAll("__HOUSEHOLD__", /^[a-z0-9]+$/i.test(household ?? "") ? household! : "")
      .replaceAll("__PANTARR_API__", api).replaceAll("__PANTARR_KEY__", key).replaceAll("__VERSION__", version);
  },
  parse(_ctx: ConnectorContext, raw) {
    const d = JSON.parse(raw.text) as { content: string; created: string; id: string };
    return parseIntermarche(d.content, d.created.slice(0, 10), d.id);
  },
};
