import { minutesOf, parseLine, recipeLines, scaleLine, servingsFor } from "./recipe-quantities";
import type { Meal } from "./types";

describe("time of a Mealie recipe", () => {
  it("prefers the total time in seconds, then prep + cooking, then the text", () => {
    expect(minutesOf({ totalTimeSeconds: 780, prepTimeSeconds: 300 })).toBe(13);
    expect(minutesOf({ prepTimeSeconds: 1500, performTimeSeconds: 1800 })).toBe(55);
    expect(minutesOf({ totalTime: "20 minutes" })).toBe(20);
    expect(minutesOf({ totalTime: "1 h 15 min" })).toBe(75);
    expect(minutesOf({ totalTime: "PT45M" })).toBe(45);
    expect(minutesOf({})).toBeNull();
  });
});

describe("quantities of the recipe lines (Jow imports as plain text)", () => {
  it("reads the leading quantity and unit", () => {
    expect(parseLine("320 g Brocoli (frais)")).toMatchObject({ quantity: 320, unit: "g", name: "Brocoli (frais)" });
    expect(parseLine("0,4 bou. Menthe (feuilles)")).toMatchObject({ quantity: 0.4, unit: "bou.", name: "Menthe (feuilles)" });
    expect(parseLine("1 dl de vin blanc sec")).toMatchObject({ quantity: 1, unit: "dl", name: "vin blanc sec" });
    expect(parseLine("1/2 gou. Ail")).toMatchObject({ quantity: 0.5, unit: "gou.", name: "Ail" });
    expect(parseLine("4 Bœuf (rumsteck)")).toMatchObject({ quantity: 4, unit: "", name: "Bœuf (rumsteck)" });
    expect(parseLine("Sel ou sel fin")).toMatchObject({ quantity: null, name: "Sel ou sel fin" });
  });
  it("scales grams to the unit and counts to the quarter", () => {
    expect(scaleLine(parseLine("320 g Brocoli (frais)"), 0.5).text).toBe("160 g Brocoli (frais)");
    expect(scaleLine(parseLine("4 Bœuf (rumsteck)"), 0.625).text).toBe("2,5 Bœuf (rumsteck)");
    expect(scaleLine(parseLine("Sel"), 0.5).text).toBe("Sel");
  });
});

describe("recipe of a meal scaled to its people and its leftovers", () => {
  const members = [{ name: "Paul", kind: "adult" }, { name: "Emma", kind: "adult" }, { name: "Hugo", kind: "child" }, { name: "Lina", kind: "child" }];
  const recipe = { servings: 4, lines: ["400 g Pâtes (spaghetti)", "1 Oignon jaune"] };
  it("counts a child for half", () => expect(servingsFor(["Paul", "Emma", "Hugo", "Lina"], members)).toBe(3));
  it("cooks for the people who eat it and those who eat the leftovers", () => {
    const meals: Meal[] = [
      { date: "2026-11-09", meal: "dinner", for: ["Paul", "Emma"], dish: "Bolognaise", leftovers_for: "2026-11-10 dinner" },
      { date: "2026-11-10", meal: "dinner", for: ["Hugo", "Lina"], dish: "Restes de bolognaise", leftovers_from: "2026-11-09 dinner" },
    ];
    expect(recipeLines(meals, 0, recipe, members).map((l) => l.text)).toEqual(["300 g Pâtes (spaghetti)", "0,75 Oignon jaune"]);
    expect(recipeLines(meals, 1, recipe, members)).toEqual([]);
  });

  it("cooks only for those eating the main dish, plus a child eating it as leftovers the next day", () => {
    const meals: Meal[] = [
      { date: "2026-11-10", meal: "dinner", for: ["Paul", "Emma", "Hugo", "Lina"], dish: "Riz sauté",
        adjustments: [{ member: "Hugo", text: "coquillettes", replaces: true }, { member: "Lina", text: "Repas de restes (du 2026-11-09 dinner)" }] },
      { date: "2026-11-11", meal: "dinner", for: ["Paul", "Emma", "Hugo"], dish: "Soupe",
        adjustments: [{ member: "Hugo", text: "restes", leftovers_from: "2026-11-10 dinner" }] },
    ];
    // Paul + Emma + Hugo the next day (½) = 2,5 servings of a recipe for 4
    expect(recipeLines(meals, 0, recipe, members).map((l) => l.text)).toEqual(["250 g Pâtes (spaghetti)", "0,75 Oignon jaune"]);
  });
});

