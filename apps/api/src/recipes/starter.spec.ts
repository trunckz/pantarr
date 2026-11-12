import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseLine } from "../planning/recipe-quantities";
import { photoCredit, starterRecipes } from "./starter.service";

describe("starter recipes", () => {
  const all = starterRecipes();
  it("are 50 dishes of 30 minutes at most, each with a photo and its credit", () => {
    expect(all).toHaveLength(50);
    expect(new Set(all.map((r) => r.name)).size).toBe(50);
    for (const r of all) {
      expect({ id: r.id, time: r.prepMinutes + r.cookMinutes <= 30, steps: r.steps.length >= 3, ingredients: r.ingredients.length >= 4 })
        .toEqual({ id: r.id, time: true, steps: true, ingredients: true });
      expect(existsSync(join(__dirname, "starter", r.image.file))).toBe(true);
      expect(photoCredit(r)).toMatch(/CC|domain/i);
    }
  });
  it("have ingredients the shopping list can read", () => {
    const lines = all.flatMap((r) => r.ingredients.map((i) => parseLine(i.text)));
    expect(lines.filter((l) => l.quantity !== null).length / lines.length).toBeGreaterThan(0.8);
    expect(parseLine("2 c. à s. d'huile d'olive")).toMatchObject({ quantity: 2, name: "huile d'olive" });
    expect(parseLine("1 boîte de haricots rouges (400 g)")).toMatchObject({ quantity: 1, unit: "boîte", name: "haricots rouges (400 g)" });
  });
});
