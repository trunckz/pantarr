import { lidlPlus } from "./lidl";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lidl = require("./lidl.user.js") as { countryOf: (h: string) => string; itemsOf: (html: string, parse: (h: string) => unknown) => { name: string; quantity: number; unitPrice: number | null; discount: number }[] };

/** A tiny stand-in for the browser's DOMParser: the spans of the printed receipt, with their attributes. */
const parse = (html: string) => ({
  querySelectorAll: () => [...html.matchAll(/<span class="(article|discount)"([^>]*)>([^<]*)<\/span>/g)].map(([, cls, attrs, text]) => ({
    classList: { contains: (c: string) => c === cls }, textContent: text,
    getAttribute: (a: string) => attrs.match(new RegExp(`${a}="([^"]*)"`))?.[1] ?? null })),
});

describe("Lidl Plus receipts", () => {
  it("knows the country of each Lidl website", () => {
    expect(["www.lidl.fr", "www.lidl.co.uk", "www.lidl.de"].map(lidl.countryOf)).toEqual(["FR", "GB", "DE"]);
  });

  it("reads the items of the printed receipt: quantity, unit price, weighed goods, discounts on the item above", () => {
    const html = '<span class="article" data-art-id="1" data-art-description="Lait demi-écrémé" data-unit-price="0.99" data-art-quantity="2">LAIT 1,98</span>'
      + '<span class="article" data-art-id="2" data-art-description="Bananes" data-unit-price="1.89" data-art-quantity="1.2">BANANES 2,27</span>'
      + '<span class="article" data-art-id="2" data-art-description="Bananes">1,2 kg x 1,89 EUR/kg</span>'
      + '<span class="discount" data-promotion-id="9">Remise -0,30</span>'
      + '<span class="article" data-art-id="3" data-art-description="Croissant" data-unit-price="0.45">CROISSANT 0,45</span>';
    expect(lidl.itemsOf(html, parse)).toEqual([
      { name: "Lait demi-écrémé", quantity: 2, unitPrice: 0.99, discount: 0 },
      { name: "Bananes (1,2 kg)", quantity: 1, unitPrice: 2.27, discount: -0.3 },
      { name: "Croissant", quantity: 1, unitPrice: 0.45, discount: 0 }]);
  });

  it("serves a script for every Lidl country, set for the household", () => {
    const js = lidlPlus.bridgeScript({ api: "https://p/api/v1", key: "k", version: "2", household: "h1" });
    expect(js).toContain("// @match        https://www.lidl.co.uk/*");
    expect(js).toContain('memo.household = "h1"');
    expect(js).not.toMatch(/__(PANTARR_API|PANTARR_KEY|VERSION|HOUSEHOLD|MATCHES)__/);
    expect(() => new Function(js)).not.toThrow();
    expect(lidlPlus.bridgeScript({ api: "a", key: "k", version: "2", household: "bad id!" })).toContain('if (!memo.household && "" &&');
  });
});
