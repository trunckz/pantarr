import { expand, invoiceLabel, parseIntermarche } from "./intermarche.purchases";

const INVOICE = `VINS, BIÈRES ET ALCOOLS (1)
CUVÉE HORTENSE - Entre-deux Mers prestige, vin blanc, la bouteille de 75 cl 2 2 20,00 % 4,29 € 5,15 € 10,30 €
MONTFLEURI - Beurre doux 60% MG, la plaquette de 250g 1 1 5,50 % 1,86 € 1,96 € 1,96 €
POMMETTE, UNE MARQUE INTERMARCHÉ - Purée de pomme banane, les 4 gourdes 3 2 5,50 % 1,50 € 1,58 € 3,16 €`;

const RECEIPT = `SAS SORIC
RUE DE LA TUDE
SURGERES BEURRE DOUX 2,98 EUR A
CHARAL S.HACHE CHARO 16,75 EUR A
CHARAL S.HACHE CHARO 16,75 EUR A
*CHOLULA KIT REPAS F 4,59 EUR A
2EME A -68% CHOLULA -3,13
MONTANT DU 72,34 EUR
CB SANS CONTACT 72,34 EUR
Nombre d'articles vendus= 12`;

describe("Intermarché purchases", () => {
  it("reads the delivered quantities of a drive invoice and groups the formats of a product", () => {
    const p = parseIntermarche(INVOICE, "2026-11-02", "d1");
    expect(p.map((x) => [x.label, x.quantity, x.unitPrice, x.channel])).toEqual([
      ["CUVÉE HORTENSE - Entre-deux Mers prestige, vin blanc", 2, 5.15, "online"],
      ["MONTFLEURI - Beurre doux 60% MG", 1, 1.96, "online"],
      ["POMMETTE, UNE MARQUE INTERMARCHÉ - Purée de pomme banane", 2, 1.58, "online"]]);
    expect(p[2].brand).toBe("POMMETTE");
  });

  it("reads an in-store receipt line by line, discounts and totals left out", () => {
    const p = parseIntermarche(RECEIPT, "2026-10-29", "d2");
    expect(p.map((x) => x.label)).toEqual(["SURGERES BEURRE DOUX", "CHARAL STEAK HACHE CHARO", "CHARAL STEAK HACHE CHARO", "CHOLULA KIT REPAS F"]);
    expect(p.every((x) => x.channel === "in-store" && x.quantity === 1)).toBe(true);
  });

  it("expands the till abbreviations", () => {
    expect(expand("PAMPERS BD CCHES GEA")).toBe("PAMPERS BD COUCHES GEA");
    expect(expand("NATIVE EAU MINER. 6X")).toBe("NATIVE EAU MINERALE 6X");
    expect(invoiceLabel("LE GAULOIS - L'escalope Cordon bleu poulet, la boite de 2 - 200 g").label).toBe("LE GAULOIS - L'escalope Cordon bleu poulet");
  });
});

describe("Intermarché basket: usual products", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { habituelsDe } = require("./cart.user.js") as { habituelsDe: (h: { l: string; s: string; n: number; d: string }[], k: string) => { l: string }[] };
  const bought = ["Persil - Lessive liquide douceur d'amande", "Saint Eloi, une marque Intermarché - Croûtons saveur ail", "Findus - Epinards hachés à la crème fraîche",
    "Maison Perrier - Boisson gazeuse aromatisée citron vert - Forever", "Findus - Poireaux à la crème", "Sodebo - Dolce pizza - pizza regina, mozzarella jambon & champignons",
    "La Laitière - Crème aux œufs vanille", "Brioche Pasquier - Biscotte sans sel et sans sucres ajoutés", "Blédina - Plat bébé pâtes à la sauce tomate jambon dès 15 mois - Blédichef",
    "Herta - Lardons fumés sans nitrite", "Labeyrie - Saumon fumé L'Ecosse", "Charal - Steaks hachés pur bœuf 15% MG", "Terroirs, une marque Intermarché - Oignon JAUNE",
    "Harrys - Pain de mie complet sans sucres ajoutés - American Sandwich", "Herta - Le Bon Paris jambon cuit à l'étouffée"].map((l) => ({ l, s: "drive", n: 2, d: "2026-11-02" }));
  const first = (k: string) => habituelsDe(bought, k)[0]?.l ?? null;
  it("does not take a product whose name only mentions the item", () => {
    for (const k of ["Persil (1 bouquet)", "Ail (2 gousses)", "Bœuf haché (125 g)", "Citron (1)", "Crème fraîche (1 pot de 25 cl)", "Œufs (1 boîte de 6)", "Brioche (1)", "Tomate (1)"])
      expect({ k, p: first(k) }).toEqual({ k, p: null });
  });
  it("keeps the products that are the item", () => {
    expect(first("Lardons (1 paquet)")).toBe("Herta - Lardons fumés sans nitrite");
    expect(first("Saumon fumé (1 paquet de 120 g)")).toBe("Labeyrie - Saumon fumé L'Ecosse");
    expect(first("Steak haché (1)")).toBe("Charal - Steaks hachés pur bœuf 15% MG");
    expect(first("Oignons (2)")).toBe("Terroirs, une marque Intermarché - Oignon JAUNE");
    expect(first("Pain de mie (1 paquet)")).toBe("Harrys - Pain de mie complet sans sucres ajoutés - American Sandwich");
    expect(first("Jambon blanc (1 paquet de 4 tranches)")).toBeNull();   // « Le Bon Paris jambon » : the type is « Le Bon Paris »
  });
});

describe("Intermarché basket: the item itself first", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { estLArticle, rangDe } = require("./cart.user.js") as { estLArticle: (k: string, n: string) => boolean; rangDe: (k: string, n: string) => number };
  it("is not a product that only mentions the item, nor a transformed one", () => {
    expect(estLArticle("Brioche (1)", "Brioche Pasquier - Biscotte sans sel et sans sucres ajoutés")).toBe(false);
    expect(estLArticle("Jambon blanc (1 paquet de 4 tranches)", "Aoste - Les Fines et Fondantes - Jambon cru Serrano sans conservateur")).toBe(false);
    expect(estLArticle("Tomate (1)", "Mutti - Tomates Polpa concassées fines")).toBe(false);
    expect(estLArticle("Tomates concassées (1 boîte)", "Mutti - Tomates Polpa concassées fines")).toBe(true);
    expect(estLArticle("Citron (1)", "Bouton d'Or, une marque Intermarché - jus de citron de Sicile à base de concentré")).toBe(false);
    expect(estLArticle("Citron (1)", "Le Choix du Primeur - Citron jaune")).toBe(true);
    expect(estLArticle("Œufs (1 boîte de 6)", "Volaé, une marque Intermarché - Œufs frais de poules élevées en plein air BIO")).toBe(true);
    expect(estLArticle("Crème fraîche (1 pot de 25 cl)", "Les Éleveurs vous disent Merci, une marque Intermarché - Crème fraîche épaisse entière 30%")).toBe(true);
    expect(estLArticle("Bœuf haché (125 g)", "Jean Rozé, une marque Intermarché - Viande hachée vrac pur BŒUF 15% MG")).toBe(false);
  });
  it("puts the item before the products that only contain its word", () => {
    const names = ["Taureau Ailé - Riz Basmati", "Pom Bistro - Pommes de terre sarladaise aux cèpes ail et persil", "Le Choix du Primeur - Ail blanc"];
    const sorted = names.map((n, i) => ({ n, i, r: rangDe("Ail (2 gousses)", n) })).sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.n);
    expect(sorted[0]).toBe("Le Choix du Primeur - Ail blanc");
    expect(rangDe("Persil (1 bouquet)", "Pom Bistro - Pommes de terre sarladaise aux cèpes ail et persil")).toBe(0);
  });
});

describe("Intermarché basket: shelves learned", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require("./cart.user.js") as { classer: (r: object[], k: string, a: string, mem: object, nom: (p: { n: string }) => string) => { n: string }[];
    apprendreRayon: (mem: object, a: string, k: string, p: object) => void; universDe: (mem: object, a: string) => string | null; nouveauxRayons: () => object };
  const p = (n: string, u: string, r: string) => ({ n, idUnivers: u, idRayon: r });
  it("puts the products of the univers of the aisle first once it is known, and the item's own shelf", () => {
    const mem = m.nouveauxRayons();
    m.apprendreRayon(mem, "Fruits et légumes", "oignons", p("Oignon jaune", "2215", "3001"));
    expect(m.universDe(mem, "Fruits et légumes")).toBeNull();   // seen once: not sure yet
    m.apprendreRayon(mem, "Fruits et légumes", "persil", p("Persil plat", "2215", "3050"));
    expect(m.universDe(mem, "Fruits et légumes")).toBe("2215");
    const results = [p("Pom Bistro - Pommes de terre sarladaise ail et persil", "2220", "4000"), p("Maggi - Persillade surgelée", "2230", "4100"), p("Terroirs - Persil frisé bouquet", "2215", "3050")];
    expect(m.classer(results, "persil", "Fruits et légumes", mem, (x) => x.n).map((x) => x.n)[0]).toBe("Terroirs - Persil frisé bouquet");
    const garlic = [p("Taureau Ailé - Riz Basmati", "2213", "3930"), p("Le Choix du Primeur - Ail violet", "2215", "3010")];
    expect(m.classer(garlic, "ail", "Fruits et légumes", mem, (x) => x.n).map((x) => x.n)).toEqual(["Le Choix du Primeur - Ail violet", "Taureau Ailé - Riz Basmati"]);
  });
});

describe("Intermarché basket: brands", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require("./cart.user.js") as { classer: (r: { n: string }[], k: string, a: string, mem: object, nom: (p: { n: string }) => string, b: object) => { n: string }[]; nouveauxRayons: () => object };
  it("never proposes a banned brand and puts a preferred one first", () => {
    const r = [{ n: "Herta - Lardons fumés" }, { n: "Fleury Michon - Lardons fumés" }, { n: "Monique Ranou, une marque Intermarché - Lardons fumés" }];
    const out = m.classer(r, "lardons", "", m.nouveauxRayons(), (x) => x.n, { like: ["Monique Ranou"], ban: ["herta"] }).map((x) => x.n);
    expect(out).toEqual(["Monique Ranou, une marque Intermarché - Lardons fumés", "Fleury Michon - Lardons fumés"]);
  });
});
