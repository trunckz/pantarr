// Example connector plugin for Pantarr: purchases from CSV documents archived in the document manager
// (« date;label;quantity;unit price », one purchase per line, header optional). Copy this folder into the folder named
// by PANTARR_CONNECTORS_DIR and restart Pantarr: « CSV purchases » appears on the Connectors page.
// Plain JavaScript (CommonJS); the types are in @pantarr/connector-sdk (packages/connector-sdk/src/index.ts).

/** @type {import("@pantarr/connector-sdk").PurchasesConnector} */
const csvPurchases = {
  manifest: {
    id: "csv-purchases",
    kind: "purchases",
    name: "CSV purchases (example plugin)",
    description: "One purchase per line: date;label;quantity;unit price.",
    settings: {
      correspondent: { type: "string", title: "Correspondents of the CSV documents (comma separated)", required: true },
    },
  },
  // raw.text is the archived document as JSON: { id, title, created, content, correspondent }
  parse(ctx, raw) {
    const doc = JSON.parse(raw.text);
    return doc.content.split(/\r?\n/).map((l) => l.split(";").map((x) => x.trim()))
      .filter((c) => c.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(c[0]))
      .map(([date, label, quantity, price]) => ({
        date, label, quantity: Number(quantity) || 1, unitPrice: price ? Number(price.replace(",", ".")) : undefined,
        store: doc.correspondent, channel: "in-store", externalId: `doc:${doc.id}`,
      }));
  },
};

module.exports = { connectors: [csvPurchases] };
