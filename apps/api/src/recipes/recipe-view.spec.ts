import type { ConnectorContext } from "@pantarr/connector-sdk";
import { config } from "../config";
import { mealieIsPrivate, minutesText, presented, recipePatch, recipeView } from "./recipe-view";

const ctx = (settings: Record<string, unknown>) => ({ settings, locale: "fr", log: () => undefined, fetch }) as ConnectorContext;

describe("recipes shown by Pantarr when Mealie is not public", () => {
  const cfg = config as unknown as { mode: string };
  afterEach(() => { cfg.mode = "self-hosted"; });

  it("knows when the households cannot open Mealie", () => {
    expect(mealieIsPrivate(ctx({ url: "http://10.20.0.89:9000", publicUrl: "https://mealie.example.com" }))).toBe(false);
    expect(mealieIsPrivate(ctx({ url: "http://mealie:9000" }))).toBe(true);
    expect(mealieIsPrivate(ctx({ url: "http://192.168.10.20:9000" }))).toBe(true);
    expect(mealieIsPrivate(ctx({ url: "https://recettes.example.com" }))).toBe(false);
    cfg.mode = "hosted";
    expect(mealieIsPrivate(ctx({ url: "https://recettes.example.com" }))).toBe(true);
  });

  it("links to the Pantarr recipe page and serves the pictures, or keeps Mealie's links", () => {
    const list = [{ id: "a1b2c3d4-0000-4000-8000-000000000001", slug: "pates-carbonara", name: "Pâtes carbonara", url: "http://mealie:9000/g/x/r/pates-carbonara", image: "http://mealie:9000/api/media/…" }];
    expect(presented("h1", ctx({ url: "http://mealie:9000" }), list)[0]).toMatchObject({
      url: "/recipes/pates-carbonara", image: "/api/v1/households/h1/recipes/a1b2c3d4-0000-4000-8000-000000000001/image" });
    expect(presented("h1", ctx({ url: "http://mealie:9000", publicUrl: "https://m.example.com" }), list)[0]).toMatchObject({
      url: "/recipes/pates-carbonara", mealieUrl: list[0].url, image: list[0].image });
  });

  it("gives the page its ingredients by section, steps, time and source", () => {
    const v = recipeView("h1", { id: "r1", slug: "s", name: "Rougail", orgURL: "https://jow.fr/recipes/x", recipeServings: 4, totalTimeSeconds: 1800,
      recipeIngredient: [{ title: "Sauce", display: "400 g Tomate pelée" }, { display: "1 Oignon jaune" }, { title: "Riz", note: "280 g Riz" }],
      recipeInstructions: [{ text: "Émincer l'oignon." }, { title: "", text: " " }, { text: "Cuire 20 min." }], tags: [{ name: "Viande" }] });
    expect(v).toMatchObject({ minutes: 30, servings: 4, source: "https://jow.fr/recipes/x", image: "/api/v1/households/h1/recipes/r1/image?size=full", tags: ["Viande"],
      ingredients: [{ section: "Sauce", text: "400 g Tomate pelée" }, { section: "Sauce", text: "1 Oignon jaune" }, { section: "Riz", text: "280 g Riz" }],
      steps: [{ title: "", text: "Émincer l'oignon." }, { title: "", text: "Cuire 20 min." }] });
  });

  it("writes the edited times as Mealie shows them", () => {
    expect(minutesText(20)).toBe("20 min");
    expect(minutesText(75)).toBe("1 h 15");
    expect(minutesText(120)).toBe("2 h");
    expect(minutesText(75, "en")).toBe("1 h 15 min");
  });

  it("turns the editor's recipe into Mealie fields, keeping what did not change", () => {
    const parsed = { title: "Pâtes", quantity: 400, unit: { name: "g" }, food: { name: "Spaghetti" }, note: "", display: "400 g Spaghetti", referenceId: "i1" };
    const raw = { id: "r1", slug: "carbo", name: "Carbo", recipeIngredient: [parsed, { display: "3 Jaunes d'œuf", note: "3 Jaunes d'œuf", referenceId: "i2" }],
      recipeInstructions: [{ id: "s1", text: "Cuire les pâtes.", ingredientReferences: [{ referenceId: "i1" }] }] };
    const tags = [{ id: "t1", name: "Rapide", slug: "rapide" }, { id: "t2", name: "Italien", slug: "italien" }];
    const p = recipePatch(raw, {
      name: " Carbonara ", servings: 4, prepMinutes: 10, cookMinutes: 12, totalMinutes: null,
      ingredients: [{ section: "Pâtes", text: "400 g Spaghetti" }, { section: "Sauce", text: "4 Jaunes d'œuf" }, { section: "Sauce", text: "150 g Guanciale" }, { text: " " }],
      steps: [{ text: "Cuire les pâtes." }, { title: "Sauce", text: "Mélanger les jaunes et le pecorino." }, { text: "" }],
      notes: [{ title: "Astuce", text: "Pas de crème." }], tags: ["rapide", "italien", "Inconnu"], categories: [] }, { tags, categories: [] });
    expect(p).toMatchObject({ name: "Carbonara", recipeServings: 4, prepTime: "10 min", prepTimeSeconds: 600, performTime: "12 min", totalTime: "22 min", totalTimeSeconds: 1320,
      tags: [tags[0], tags[1]], notes: [{ title: "Astuce", text: "Pas de crème." }] });
    // unchanged ingredient kept whole (quantity, unit, food), changed ones are plain text, sections on their first line
    expect(p.recipeIngredient[0]).toMatchObject({ quantity: 400, food: { name: "Spaghetti" }, referenceId: "i1", title: "Pâtes" });
    expect(p.recipeIngredient[1]).toMatchObject({ note: "4 Jaunes d'œuf", title: "Sauce", food: null });
    expect(p.recipeIngredient[2]).toMatchObject({ note: "150 g Guanciale", title: "" });
    expect(p.recipeIngredient).toHaveLength(3);
    expect(p.recipeInstructions).toHaveLength(2);
    expect(p.recipeInstructions[0]).toMatchObject({ id: "s1", ingredientReferences: [{ referenceId: "i1" }], title: "" });
    expect(p.recipeInstructions[1]).toMatchObject({ title: "Sauce", text: "Mélanger les jaunes et le pecorino.", ingredientReferences: [] });
  });
});
