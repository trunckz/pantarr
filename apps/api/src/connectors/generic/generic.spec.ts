import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IMPLEMENTED } from "../connectors.service";
import { loadPlugins } from "../plugins";
import { parseOrderMail } from "./generic.connectors";
import { decodeEntities } from "../mailbox/mailbox.connector";
import { BUILT_IN } from "../registry";
import { parseReceipt } from "./generic.connectors";

describe("generic receipt reader", () => {
  it("reads the article lines until the total, with « n x price » quantities", () => {
    const text = ["E.LECLERC SAINT-JEAN", "12/10/2026 10:42", "LAIT DEMI ECREME 1L   1,05 €", "2 x 1,50", "YAOURT NATURE X4   3,00 € A",
      "PAIN DE MIE COMPLET 1.89", "REMISE FIDELITE -0,50", "TOTAL 5,94", "CB 5,94", "SAUCISSON 4,00"].join("\n");
    expect(parseReceipt(text, "2026-10-12", "Leclerc", "doc:1").map((p) => [p.label, p.quantity, p.unitPrice])).toEqual([
      ["LAIT DEMI ECREME 1L", 1, 1.05], ["YAOURT NATURE X4", 2, 1.5], ["PAIN DE MIE COMPLET", 1, 1.89]]);
  });
});

describe("connector plugins", () => {
  it("loads a plugin folder, a new connector, never in place of a built-in one", () => {
    const dir = mkdtempSync(join(tmpdir(), "pantarr-plugins-"));
    writeFileSync(join(dir, "bring.js"), `module.exports = { manifest: { id: "bring", kind: "list-sync", name: "Bring! (plugin)", settings: {} }, pull: async () => [] };`);
    writeFileSync(join(dir, "todoist.js"), `module.exports = { manifest: { id: "todoist", kind: "list-sync", name: "Todoist (plugin)", settings: {} }, pull: async () => [] };`);
    writeFileSync(join(dir, "mealie.js"), `module.exports = { manifest: { id: "mealie", kind: "recipes", name: "Fake", settings: {} } };`);
    writeFileSync(join(dir, "broken.js"), `throw new Error("boom")`);
    expect(loadPlugins(join(__dirname, "../../../../../examples/connectors"))).toEqual(["csv-purchases"]);
    expect(loadPlugins(dir)).toEqual(["bring"]);
    expect((IMPLEMENTED as unknown as Record<string, unknown>).bring).toBeDefined();
    expect(BUILT_IN.filter((m) => m.id === "bring")).toEqual([expect.objectContaining({ name: "Bring! (plugin)" })]);
    expect(BUILT_IN.filter((m) => m.id === "todoist")).toEqual([expect.objectContaining({ name: "Todoist" })]);
    expect(BUILT_IN.find((m) => m.id === "mealie")?.name).toBe("Mealie");
    const csv = (IMPLEMENTED as unknown as Record<string, { parse: (c: unknown, r: { contentType: string; text: string }) => unknown[] }>)["csv-purchases"];
    expect(csv.parse({}, { contentType: "application/json", text: JSON.stringify({ id: 3, created: "2026-11-01", correspondent: "Bio", content: "date;label;quantity;price\n2026-11-01;Pommes;2;0,80" }) }))
      .toEqual([{ date: "2026-11-01", label: "Pommes", quantity: 2, unitPrice: 0.8, store: "Bio", channel: "in-store", externalId: "doc:3" }]);
  });
});

describe("order mails of the drives", () => {
  it("reads « name / packaging / xN / unit price / total » blocks, not the totals", () => {
    const text = ["Récapitulatif de votre commande", "16 produits", "Quantité", "Prix unitaire", "TTC", "Total", "TTC",
      "Entremont Fromage Râpé Emmental", "le sachet de 500 g", "x1", "5,48 €", "5,48 €",
      "Viennois Mousse liégeoise chocolat", "les 4 pots de 90g - 360g", "x2", "1,57 €", "3,14 €",
      "Native, une marque Intermarché Eau minérale naturelle", "les 6 bouteilles de 1,5L", "x2", "2,17 €", "4,34 €",
      "Remise immédiate : -0,66 €", "Total payé", "50,00 €"].join("\n");
    expect(parseOrderMail(text, "2026-11-02", "Intermarché", "receipt:1")).toEqual([
      { date: "2026-11-02", label: "Entremont Fromage Râpé Emmental (sachet de 500 g)", quantity: 1, unitPrice: 5.48, store: "Intermarché", channel: "online", externalId: "receipt:1" },
      { date: "2026-11-02", label: "Viennois Mousse liégeoise chocolat (4 pots de 90g - 360g)", quantity: 2, unitPrice: 1.57, store: "Intermarché", channel: "online", externalId: "receipt:1" },
      { date: "2026-11-02", label: "Native, une marque Intermarché Eau minérale naturelle (6 bouteilles de 1,5L)", quantity: 2, unitPrice: 2.17, store: "Intermarché", channel: "online", externalId: "receipt:1" },
    ]);
  });
  it("finds nothing in an ordinary receipt", () => {
    expect(parseOrderMail("BEURRE DOUX 250G 2,98\nTOTAL 2,98", "2026-11-02", "", "r")).toEqual([]);
  });
});

describe("HTML of the mails", () => {
  it("decodes named, decimal and hexadecimal character references", () => {
    expect(decodeEntities("R&eacute;capitulatif &agrave; T&#xE9;l&#233; l&rsquo;appli &Eacute;t&eacute; &euro; &unknown;")).toBe("Récapitulatif à Télé l’appli Été € &unknown;");
  });
});
