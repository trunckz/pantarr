import { htmlText } from "../connectors/mailbox/mailbox.connector";
import { dateIn, orderOf, purchasesOf, readText, receiptPrompt } from "./receipts.service";

describe("receipts inbox", () => {
  it("finds the date written on a receipt", () => {
    expect(dateIn("LIDL\n05/11/2026 18:42\nBEURRE 2,19")).toBe("2026-11-05");
    expect(dateIn("Commande du 2026-10-30")).toBe("2026-10-30");
    expect(dateIn("le 5.11.26")).toBe("2026-11-05");
    expect(dateIn("31/13/2026")).toBeNull();
  });

  it("asks the model for the items only, and gives it the text of a mail", () => {
    const p = receiptPrompt("fr", "Votre commande Leclerc\n2 x Lait 1,05");
    expect(p).toContain("Ignore les totaux");
    expect(p).toContain("2 x Lait 1,05");
    expect(receiptPrompt("en")).toContain("(file attached)");
  });

  it("turns the model's answer into purchases, invalid items left out", () => {
    const r = purchasesOf({ store: "Lidl", date: "2026-11-04", channel: "in-store", items: [
      { label: "Beurre doux 250 g", brand: "Envia", quantity: 2, unit_price: 2.19 }, { label: "" }, { label: "Pain", quantity: -1, unit_price: "x" }] }, "2026-11-05", "receipt:r1");
    expect(r.store).toBe("Lidl");
    expect(r.lines).toEqual([
      { date: "2026-11-04", label: "Beurre doux 250 g", brand: "Envia", quantity: 2, unitPrice: 2.19, store: "Lidl", channel: "in-store", externalId: "receipt:r1" },
      { date: "2026-11-04", label: "Pain", brand: undefined, quantity: 1, unitPrice: undefined, store: "Lidl", channel: "in-store", externalId: "receipt:r1" }]);
    expect(purchasesOf({ store: "null", date: "hier", items: "rien" }, "2026-11-05", "x")).toMatchObject({ store: null, date: "2026-11-05", lines: [] });
  });

  it("reads an order confirmation mail as text", () => {
    expect(htmlText("<style>p{}</style><table><tr><td>Lait</td><td>1,05&nbsp;&euro;</td></tr><tr><td>Pain</td></tr></table>")).toBe("Lait 1,05 €\nPain");
  });

  it("reads a receipt without any LLM: the Intermarché reader, else the generic one, store and channel recognised", () => {
    const ocr = "Intermarche\nSAS SORIC\nBIENVENUE !\nSURGERES BEURRE DOUX 2,98 EUR A\n*HAR.MEGAFETE DRAGIB 5,89 EUR B\nCHARAL S.HACHE CHARO 16,75 EUR A\n2EME A -50% HARIBO -2,95\nMONTANT DU 72,34 EUR\nNombre d'articles vendus= 3";
    const a = readText(ocr, "2026-10-29", "receipt:r1");
    expect(a).toMatchObject({ store: "Intermarché", channel: "in-store" });
    expect(a.lines.map((p) => p.label)).toEqual(["SURGERES BEURRE DOUX", "HAR.MEGAFETE DRAGIB", "CHARAL STEAK HACHE CHARO"]);
    const lidl = readText("LIDL\nEUR\nLait demi-ecreme 0,99 A\nPommes Gala 2,49 A\n2 x 0,55\nCroissant 1,10 A\nTotal 4,58", "2026-11-04", "receipt:r2");
    expect(lidl).toMatchObject({ store: "Lidl", channel: "in-store" });
    expect(lidl.lines.map((p) => [p.label, p.quantity])).toEqual([["Lait demi-ecreme", 1], ["Pommes Gala", 1], ["Croissant", 2]]);
    expect(readText("Votre commande Leclerc Drive\nLait 1,05", "2026-11-04", "x", true).channel).toBe("online");
  });
});


describe("online orders", () => {
  it("knows the order of a mail and which mail it is", () => {
    const body = "Intermarché\nChalais\nN° de commande\n619531619\nDrive\n";
    expect(orderOf(body, "Intermarché", "Votre facture est disponible.txt")).toEqual({ key: "intermarché:619531619", rank: 3 });
    expect(orderOf(body, "Intermarché", "Bonne nouvelle : votre commande est prête !.txt")).toEqual({ key: "intermarché:619531619", rank: 2 });
    expect(orderOf(body, "Intermarché", "Votre commande est validée !.txt")).toEqual({ key: "intermarché:619531619", rank: 1 });
    expect(orderOf("Commande n° 12345678 du 2 novembre", "Leclerc", "Confirmation")).toEqual({ key: "leclerc:12345678", rank: 1 });
    expect(orderOf("Ticket de caisse\nTOTAL 12,50", "Lidl", "ticket")).toBeNull();
  });
  it("does not take a loyalty balance in a mail for a purchase", () => {
    expect(readText("Ce week-end, les bons d'achat vous attendent\nMon solde fidélité** : 18,09 €\nVoir l'offre", "2026-10-27", "r", true).lines).toEqual([]);
  });
});

describe("date of a receipt", () => {
  it("skips a phone number and prefers the date next to the time", () => {
    const { dateIn } = jest.requireActual("./receipts.service") as typeof import("./receipts.service");
    expect(dateIn("SAS SORIC Tel: 05.45.98.16.74 BIENVENUE … 11:23:15 7/11/2026 M09116")).toBe("2026-11-07");
    expect(dateIn("Tel 05.45.98.16.74 le 14/11/24")).toBe("2024-11-14");
  });
});
