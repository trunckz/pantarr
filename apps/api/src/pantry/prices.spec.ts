import { countOf, estimateList, priceIndex, priceOf, wordsOf } from "./prices";

// labels as they come from Intermarché receipts and orders
const index = priceIndex([
  { label: "SALADE SUCRINE BARQU", unitPrice: 1.29 }, { label: "SALADE SUCRINE BARQU", unitPrice: 1.49 }, { label: "SALADE SUCRINE BARQU", unitPrice: 1.29 },
  { label: "PSDT EMMENTAL RAPE 2", unitPrice: 2.06 }, { label: "BANANE PIECE ANTILLE", unitPrice: 2 },
  { label: "JOKER - Le Pur Jus - Jus d'orange sans pulpe", unitPrice: 3.64 }, { label: "P&C FILET LIMAND MEU", unitPrice: 3.39 },
  { label: "COURGETTE VRAC", unitPrice: 0.89 }, { label: "LAIT DEMI ECREME 1L", unitPrice: 0.99 }, { label: "Native eau minérale 6x1,5L", unitPrice: 2.9 },
  { label: "ERREUR", unitPrice: 0 }, { label: "SANS PRIX", unitPrice: null },
]);

describe("prices learned from the purchases", () => {
  it("keeps the usual price of a product", () => {
    expect(index.find((p) => p.label === "SALADE SUCRINE BARQU")!.price).toBe(1.29);
    expect(index.some((p) => p.label === "ERREUR" || p.label === "SANS PRIX")).toBe(false);
  });
  it("finds the product of an article, labels cut short included", () => {
    expect(priceOf("Salade sucrine", index)!.price).toBe(1.29);
    expect(priceOf("Emmental râpé", index)!.price).toBe(2.06);
    expect(priceOf("2 bananes", index)!.price).toBe(2);
    expect(priceOf("Jus d'orange", index)!.price).toBe(3.64);
    expect(priceOf("Limande", index)!.price).toBe(3.39);
    expect(priceOf("Caviar", index)).toBeNull();
  });
  it("uses the product chosen for the article first", () => {
    expect(priceOf("Eau", index, "Native")!.price).toBe(2.9);
  });
  it("counts the units, not the weights", () => {
    expect(countOf("3 courgettes")).toBe(3);
    expect(countOf("2 x lait")).toBe(2);
    expect(countOf("500 g de bœuf")).toBe(1);
    expect(countOf("1 l de lait")).toBe(1);
    expect(countOf("Lait")).toBe(1);
    expect(wordsOf("2 sachets de salade bio")).toEqual(["salade"]);
  });
  it("estimates a list, the unknown articles at the usual price", () => {
    const e = estimateList(["3 courgettes", "Lait", "Caviar"], index);
    expect(e.known).toBe(3.66);
    expect(e.priced).toBe(2);
    expect(e.total).toBeGreaterThan(e.known);
  });
});
