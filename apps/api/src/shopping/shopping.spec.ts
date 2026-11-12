import { aggregate, invented, needsOf, noteOf, shoppingPrompt, sourcesOf } from "./shopping.service";

const meals = [
  { date: "2026-11-09", meal: "lunch" as const, dish: "Tatin", ingredients: [{ name: "courgettes", quantity: 600, unit: "g", aisle: "Fruits et légumes" }, { name: "Sel", aisle: "Épicerie" }, { name: "Pâte brisée", quantity: 1, unit: "rouleau", aisle: "Épicerie" }] },
  { date: "2026-11-09", meal: "dinner" as const, dish: "Ratatouille", ingredients: [{ name: "Courgettes", quantity: 400, unit: "g", aisle: "Fruits et légumes" }, { name: "Huile d'olive", quantity: 2, unit: "c. à s." }, { name: "Poivron", aisle: "Fruits et légumes" }, { name: "poivron", quantity: 2, aisle: "Fruits et légumes" }] },
];

describe("shopping from meals", () => {
  const needs = aggregate(meals, ["sel", "huile"]);
  it("sums the same ingredient and unit, accents and case ignored", () => {
    expect(needs.find((n) => n.name === "Courgettes")).toMatchObject({ quantity: 1000, unit: "g", dishes: ["Tatin", "Ratatouille"] });
  });
  it("leaves the pantry staples out (first words)", () => {
    expect(needs.map((n) => n.name)).not.toContain("Sel");
    expect(needs.map((n) => n.name)).not.toContain("Huile d'olive");
  });
  it("makes the total unknown when a quantity is missing", () => {
    expect(needs.find((n) => n.name === "Poivron")?.quantity).toBeNull();
    expect(noteOf(needs.find((n) => n.name === "Poivron")!)).toBe("Poivron");
    expect(noteOf(needs.find((n) => n.name === "Courgettes")!)).toBe("Courgettes (1000 g)");
  });
});

describe("shopping list by the LLM", () => {
  // From the menu of 09/11: carbonara for four, Emma with broccoli, the children with pasta and tomato sauce
  const carbonara = [
    { date: "2026-11-09", meal: "dinner" as const, dish: "Pâtes carbonara", for: ["Paul", "Emma", "Hugo", "Lina"],
      recipeIngredients: ["300 g Pâtes (spaghetti)", "3 Œuf"], ingredients: [],
      adjustments: [{ member: "Emma", text: "sans lardons, avec des brocolis vapeur", ingredients: [{ name: "Brocolis", quantity: 300, unit: "g" }] },
        { member: "Hugo", text: "Coquillettes à la sauce tomate", replaces: true, ingredients: [{ name: "Coquillettes", quantity: 150, unit: "g" }] }] },
    { date: "2026-11-10", meal: "dinner" as const, dish: "Riz cantonais", for: ["Paul", "Emma", "Hugo"], recipeIngredients: ["140 g Riz"],
      adjustments: [{ member: "Hugo", text: "Repas de restes : Coquillettes (du 2026-11-09 dinner)", ingredients: [{ name: "Jambon", quantity: 1, unit: "tranche" }] }] },
  ];
  it("lists the real ingredients with where they come from, nothing for a variant eating leftovers", () => {
    expect(sourcesOf(carbonara, "fr").map((x) => `${x.from} | ${x.text}`)).toEqual([
      "Pâtes carbonara | 300 g Pâtes (spaghetti)", "Pâtes carbonara | 3 Œuf",
      "Pâtes carbonara · variante Emma | 300 g Brocolis", "Pâtes carbonara · variante Hugo | 150 g Coquillettes",
      "Riz cantonais | 140 g Riz"]);
  });
  it("gives the model the ingredients only, not the dishes' descriptions", () => {
    const p = shoppingPrompt(sourcesOf(carbonara, "fr"), { locale: "fr", staples: ["sel"], rules: ["Steak haché : surgelé"], aisles: ["Frais"], stock: ["Beurre doux (3)"], already: ["Couches"] });
    expect(p).toContain('{"pour":"Pâtes carbonara · variante Emma","ingredient":"300 g Brocolis"}');
    expect(p).not.toContain("sauce tomate");
    expect(p).toContain("déjà en stock : Beurre doux (3)");
    expect(p).toContain("déjà sur la liste : Couches");
    expect(p).toContain("  - Steak haché : surgelé");
  });
  it("leaves out what the model invents", () => {
    const needs = [{ name: "Spaghetti", unit: "g", quantity: 300, aisle: "", dishes: [] }, { name: "Œufs", unit: "", quantity: 3, aisle: "", dishes: [] },
      { name: "Sauce tomate", unit: "g", quantity: 400, aisle: "", dishes: [] }, { name: "Brocolis surgelés", unit: "g", quantity: 300, aisle: "", dishes: [] }];
    expect(invented(needs, sourcesOf(carbonara, "fr")).map((n) => n.name)).toEqual(["Sauce tomate"]);
  });
  it("keeps the usable items of the answer and refuses an answer without a list", () => {
    expect(needsOf({ items: [{ name: "courgettes", quantity: 3, aisle: "Frais", dishes: ["Tatin"] }, { name: "" }, { quantity: 2 }] }))
      .toEqual([{ name: "Courgettes", unit: "", quantity: 3, aisle: "Frais", dishes: ["Tatin"] }]);
    expect(needsOf({ meals: [] })).toBeNull();
    expect(needsOf({ items: [] })).toEqual([]);
  });
});

describe("aisles of the shopping list", () => {
  it("proposes the usual aisles to a new household and never keeps a copied placeholder or an unknown aisle", async () => {
    const { aislesFor, needsOf, DEFAULT_AISLES } = await import("./shopping.service");
    expect(aislesFor([], "fr")).toEqual(DEFAULT_AISLES.fr);
    expect(aislesFor(["un des rayons"], "fr")).toEqual(DEFAULT_AISLES.fr);
    expect(aislesFor(["Boissons", "Épicerie et féculents"], "fr")).toEqual(["Boissons", "Épicerie et féculents", ...DEFAULT_AISLES.fr.filter((a) => a !== "Boissons")]);
    const six = ["Frais", "Épicerie", "Légumes", "Viandes", "Hygiène maison", "Boissons fraîches"];
    expect(aislesFor(six, "fr")).toEqual(six);
    const aisles = aislesFor([], "fr");
    expect(needsOf({ items: [{ name: "ail", aisle: "un des rayons" }, { name: "persil", aisle: "fruits et legumes" }, { name: "sel", aisle: "Rayon imaginaire" }] }, aisles)!.map((n) => n.aisle))
      .toEqual(["", "Fruits et légumes", ""]);
  });
});
