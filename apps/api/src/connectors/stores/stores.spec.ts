import { allowedOrigin } from "../../app.setup";
import { STORES, storeCarts, storeScript } from "./stores";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const learn = require("./store.user.js") as {
  productsIn: (j: unknown, max?: number) => { id: string; name: string; brand: string; price: unknown }[];
  jsonInPage: (html: string) => unknown[];
  searchTemplate: (c: { url: string; method: string; body?: string | null }, w: string) => { url: string; body: string | null } | null;
  addTemplate: (c: { url: string; method: string; body?: string | null }, ids: string[]) => { idPath: string[] | null; qtyPath: string[] | null; url: string } | null;
  addRequest: (t: unknown, id: string, qty: number) => { method: string; url: string; body: string | null };
};

describe("online stores sharing the learning script", () => {
  it("gives each store its own script: its sites, its name, the user's key, valid JavaScript", () => {
    for (const s of STORES) {
      const js = storeScript(s, { api: "https://pantarr.example/api/v1", key: "k-1", version: "1" });
      for (const m of s.matches) expect(js).toContain(`// @match        ${m}`);
      expect(js).toContain(`/bridge/${s.id}/userscript.user.js?k=k-1`);
      expect(js).not.toMatch(/__(PANTARR_API|PANTARR_KEY|VERSION|MODULE|STORE_NAME|STORE_JSON|MATCHES)__/);
      expect(() => new Function(js)).not.toThrow();
    }
    expect(storeCarts.map((c) => c.manifest.kind)).toEqual(STORES.map(() => "cart"));
  });

  it("lets every Leclerc drive (one subdomain each) call the bridge, and no look-alike", () => {
    expect(allowedOrigin("https://fd7-courses.leclercdrive.fr")).toBe(true);
    expect(allowedOrigin("https://www.carrefour.fr")).toBe(true);
    expect(allowedOrigin("https://leclercdrive.fr.evil.com")).toBe(false);
    expect(allowedOrigin("https://evil.com/?x=.leclercdrive.fr")).toBe(false);
  });

  it("finds the products of any answer shape, and in the data embedded in a results page", () => {
    const j = { data: { products: [{ productId: 123, label: "Lait demi-écrémé 1L", brand: { name: "Lactel" }, price: { value: 1.2 } }, { sku: "456", name: "Lait entier", marque: "Candia" }] } };
    expect(learn.productsIn(j).map((p) => [p.id, p.name, p.brand, p.price])).toEqual([["123", "Lait demi-écrémé 1L", "Lactel", 1.2], ["456", "Lait entier", "Candia", null]]);
    const page = '<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"sku":"7","name":"Beurre doux"}}]}</script>';
    expect(learn.productsIn(learn.jsonInPage(page)[0]).map((p) => p.name)).toEqual(["Beurre doux"]);
  });

  it("learns the site's search from the user's own search of « lait »", () => {
    expect(learn.searchTemplate({ url: "https://x.fr/api/search?q=lait&page=1", method: "GET" }, "lait")?.url).toBe("https://x.fr/api/search?q={q}&page=1");
    expect(learn.searchTemplate({ url: "https://x.fr/api/search", method: "POST", body: '{"query":"lait"}' }, "lait")?.body).toBe('{"query":"{q}"}');
    expect(learn.searchTemplate({ url: "https://x.fr/api/other", method: "GET" }, "lait")).toBeNull();
  });

  it("learns the adding from one product added by hand, and repeats it for another product and quantity", () => {
    const t = learn.addTemplate({ url: "https://x.fr/api/cart/items", method: "POST", body: JSON.stringify({ items: [{ productId: 123, quantity: 1 }] }) }, ["123", "456"]);
    expect(t).toMatchObject({ idPath: ["items", "0", "productId"], qtyPath: ["items", "0", "quantity"] });
    expect(learn.addRequest(t, "456", 3).body).toBe('{"items":[{"productId":456,"quantity":3}]}');
    const u = learn.addTemplate({ url: "https://x.fr/panier/ajout/123?qte=1", method: "POST" }, ["123"]);
    expect(learn.addRequest(u, "999", 2).url).toBe("https://x.fr/panier/ajout/999?qte=1");
    expect(learn.addTemplate({ url: "https://x.fr/api/cart", method: "POST", body: "{}" }, ["123"])).toBeNull();
  });
});

describe("generic store script: Nuxt 3 sites and learning the basket (Chronodrive)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lib = require("./store.user.js") as { unflatten: (a: unknown[]) => unknown; jsonInPage: (h: string) => unknown[]; productsIn: (j: unknown) => { id: string; name: string }[];
    mayBeAdd: (c: { method: string; url: string; status: number }, host: string) => boolean };
  it("reads the products of a Nuxt 3 page (values given by index), never a number as a name", () => {
    const payload = [["ShallowReactive", 1], { data: 2 }, { search: 3 }, [4, 7], { id: 5, name: 6 }, "100245", "Lardons fumés Herta", { id: 8, name: 9 }, "100246", "Saumon fumé Labeyrie"];
    expect(lib.unflatten(payload)).toEqual({ data: { search: [{ id: "100245", name: "Lardons fumés Herta" }, { id: "100246", name: "Saumon fumé Labeyrie" }] } });
    const html = `<html><script type="application/json" data-nuxt-data="nuxt-app" id="__NUXT_DATA__">${JSON.stringify(payload)}</script></html>`;
    expect(lib.jsonInPage(html).flatMap((j) => lib.productsIn(j)).map((p) => p.name)).toEqual(["Lardons fumés Herta", "Saumon fumé Labeyrie"]);
    expect(lib.productsIn([{ id: 4, name: 100 }, { id: 5, name: 101 }])).toEqual([]);
  });
  it("learns the adding only from the store's own basket requests, never from analytics or logs", () => {
    const host = "www.chronodrive.com";
    expect(lib.mayBeAdd({ method: "POST", url: "https://log-api.eu.newrelic.com/log/v1", status: 202 }, host)).toBe(false);
    expect(lib.mayBeAdd({ method: "POST", url: "https://metrics.chronodrive.com/g/collect", status: 200 }, host)).toBe(false);
    expect(lib.mayBeAdd({ method: "POST", url: "https://api.chronodrive.com/v1/products/recommendations/_search", status: 201 }, host)).toBe(false);
    expect(lib.mayBeAdd({ method: "PUT", url: "https://api.chronodrive.com/v1/customers/me/carts/abc/items", status: 200 }, host)).toBe(true);
  });
});

describe("generic store script: products of a page", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lib = require("./store.user.js") as { productsIn: (j: unknown, max?: number, strict?: boolean) => { name: string }[] };
  it("takes in a page only what can be bought: a price, or an EAN", () => {
    const page = { blocks: [{ id: 12, title: "Choisi pour vous" }, { id: 13, title: "Nos promotions" }],
      products: [{ id: 241, name: "Lardons fumés Herta", price: { value: 1.77 } }, { id: "3760341070472", name: "Riz basmati" }] };
    expect(lib.productsIn(page, 15, true).map((p) => p.name)).toEqual(["Lardons fumés Herta", "Riz basmati"]);
    expect(lib.productsIn(page).map((p) => p.name)).not.toContain("Choisi pour vous");   // also in the site's requests
  });
});

describe("generic store script: products among filters", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lib = require("./store.user.js") as { productsIn: (j: unknown, max?: number, strict?: boolean) => { name: string }[] };
  it("keeps the priced objects when an answer also holds filters and categories", () => {
    const answer = { facets: { origin: [{ id: 1, name: "FRANCE" }, { id: 2, name: "ESPAGNE" }], category: [{ id: 30, name: "Produits laitiers & Oeufs" }] },
      results: [{ id: 501, name: "Ail blanc filet 250 g", price: { amount: 1.99 } }, { id: 502, name: "Ail violet", price: { amount: 2.49 } }] };
    expect(lib.productsIn(answer).map((p) => p.name)).toEqual(["Ail blanc filet 250 g", "Ail violet"]);
  });
});

describe("generic store script: Chronodrive cards and the item first", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lib = require("./store.user.js") as { productsIn: (j: unknown, max?: number, strict?: boolean) => { id: string; name: string; brand: string; price: unknown }[]; rankFor: (i: string, n: string) => number };
  it("reads the name, brand and price kept in sub-objects, not the promotion badges", () => {
    const listing = { facets: [{ code: "isPromo", label: "En Promo" }], badges: [{ id: 108112, label: "JUSQU'A 7% CAGNOTTÉS" }, { id: 123234, label: "Promo -30%" }],
      content: [{ id: "185052", labels: { productLabel: "Tomates cerises allongées", brandLabel: "AUCHAN", unitQuantityLabel: "250 g" }, prices: { defaultPrice: 2.55 }, stock: "HIGH_STOCK" },
        { id: "187854", labels: { productLabel: "Tomates séchées à l'huile", brandLabel: "SACLA" }, prices: { defaultPrice: 4.99 } }] };
    expect(lib.productsIn(listing, 15, true).map((p) => [p.id, p.brand, p.name, p.price])).toEqual([["185052", "AUCHAN", "Tomates cerises allongées", 2.55], ["187854", "SACLA", "Tomates séchées à l'huile", 4.99]]);
  });
  it("ranks the item itself before products containing it, transformed products and baby meals last", () => {
    const names = ["Olives vertes farcies à la tomate", "Tomates séchées", "Tomate, riz et poulet dès 6 mois", "Tomate côtelée rouge"];
    expect(names.map((n, i) => ({ n, i, r: lib.rankFor("Tomate (1)", n) })).sort((a, b) => b.r - a.r || a.i - b.i)[0].n).toBe("Tomate côtelée rouge");
    expect(lib.rankFor("Tomates séchées (1 pot)", "Tomates séchées")).toBe(2);
  });
});
