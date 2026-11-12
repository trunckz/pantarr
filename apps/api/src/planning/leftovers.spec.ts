import { changeRequest, mergeChange } from "./planning.service";
import { leftoverEdges, leftoverLinks, mainEaters, slotOf } from "./leftovers";
import type { Meal } from "./types";

const menu = (): Meal[] => [
  { date: "2026-11-09", meal: "dinner", for: ["Paul", "Emma"], dish: "Lasagnes", leftovers_for: "2026-11-10 dinner" },
  { date: "2026-11-10", meal: "lunch", for: ["Emma"], dish: "Salade de lentilles" },
  { date: "2026-11-10", meal: "dinner", for: ["Hugo", "Lina"], dish: "Restes de lasagnes", leftovers_from: "2026-11-09 dinner" },
];

describe("leftovers between meals", () => {
  it("reads a meal written in French or as a date alone", () => {
    expect(slotOf("2026-11-10 midi")).toEqual({ date: "2026-11-10", meal: "lunch" });
    expect(slotOf("le 2026-11-10 au soir")).toEqual({ date: "2026-11-10", meal: "dinner" });
    expect(slotOf("2026-11-10")).toEqual({ date: "2026-11-10", meal: "dinner" });
    expect(slotOf(null)).toBeNull();
  });

  it("links the meal that cooks leftovers and the meal that eats them, once", () => {
    expect(leftoverLinks(menu())).toEqual([{ feeds: [2], fedBy: [] }, { feeds: [], fedBy: [] }, { feeds: [], fedBy: [0] }]);
  });

  it("gives the whole menu to the model and the leftovers to respect", () => {
    const p = changeRequest(menu(), [0], 0, "plutôt du poisson", "fr");
    expect(p).toContain("[1] 2026-11-09 dinner — Paul, Emma — « Lasagnes » — fait des restes pour 2026-11-10 dinner   ← À REMPLACER");
    expect(p).toContain("[2] 2026-11-10 lunch — Emma — « Salade de lentilles »");
    expect(p).toContain("[1] fournissait les restes de [3] (« Restes de lasagnes »), qui est gardé");
    expect(p).toContain("exactement 1 repas");
    expect(p).toContain("Souhait pour [1] : plutôt du poisson");
  });

  it("replaces the linked meals together, matched by date and meal", () => {
    const m = menu();
    mergeChange(m, [0, 2], [
      { date: "2026-11-10", meal: "dinner", dish: "Restes de hachis", leftovers_from: "2026-11-09 dinner" },
      { date: "2026-11-09", meal: "dinner", dish: "Hachis parmentier", leftovers_for: "2026-11-10 dinner" },
    ]);
    expect(m.map((x) => x.dish)).toEqual(["Hachis parmentier", "Salade de lentilles", "Restes de hachis"]);
  });

  it("forgets the leftovers of a kept meal that the new dish does not take over", () => {
    const m = menu();
    mergeChange(m, [2], [{ date: "2026-11-10", meal: "dinner", dish: "Pâtes au beurre" }]);
    expect(m[0].leftovers_for).toBeNull();
    const n = menu();
    mergeChange(n, [0], [{ date: "2026-11-09", meal: "dinner", dish: "Gratin", leftovers_for: "2026-11-10 dinner" }]);
    expect(n[2].leftovers_from).toBe("2026-11-09 dinner");
  });

  it("does not believe a « leftovers for » towards another dish (menu of 09/11)", () => {
    const m: Meal[] = [
      { date: "2026-11-09", meal: "dinner", dish: "Pâtes carbonara", for: ["Paul", "Emma"], leftovers_for: "2026-11-10 dinner" },
      { date: "2026-11-10", meal: "dinner", dish: "Riz sauté aux légumes", for: ["Paul", "Emma"] },
    ];
    expect(leftoverLinks(m)).toEqual([{ feeds: [], fedBy: [] }, { feeds: [], fedBy: [] }]);
  });

  it("links the variant of a person eating leftovers, not the whole meal", () => {
    const m: Meal[] = [
      { date: "2026-11-10", meal: "dinner", dish: "Riz sauté", for: ["Paul", "Emma"] },
      { date: "2026-11-11", meal: "dinner", dish: "Soupe de petits pois", for: ["Paul", "Emma", "Hugo"],
        adjustments: [{ member: "Hugo", text: "Repas de restes : Riz sauté aux légumes (du 2026-11-10 dinner)." }] },
    ];
    expect(leftoverEdges(m)).toEqual([{ from: 0, to: 1, whole: false, members: ["Hugo"] }]);
    expect(mainEaters(m[1])).toEqual(["Paul", "Emma"]);
  });
});


describe("leftovers come from an earlier meal", () => {
  const meal = (date: string, m: "lunch" | "dinner", extra: object = {}) => ({ date, meal: m, dish: "x", for: ["A", "B"], ingredients: [], ...extra }) as never;
  it("finds the meals eating the batch of a later meal, and forgets those links last", async () => {
    const { backwardMeals, dropBackward } = await import("./leftovers");
    const meals = [
      meal("2026-11-09", "lunch", { dish: "Préparation du dimanche", leftovers_from: "2026-11-15 dinner" }),
      meal("2026-11-10", "dinner", { leftovers_from: "2026-11-09 lunch" }),
      meal("2026-11-12", "dinner", { adjustments: [{ member: "A", text: "Restes", leftovers_from: "2026-11-13 lunch" }] }),
      meal("2026-11-13", "lunch", { leftovers_for: "2026-11-11 dinner" }),
      meal("2026-11-15", "dinner", { leftovers_for: "2026-11-09 lunch" }),
    ];
    expect(backwardMeals(meals)).toEqual([0, 2, 3, 4]);
    expect(dropBackward(meals)).toBe(4);
    expect(backwardMeals(meals)).toEqual([]);
    expect((meals[1] as { leftovers_from: string }).leftovers_from).toBe("2026-11-09 lunch");   // a real one is kept
  });
});
