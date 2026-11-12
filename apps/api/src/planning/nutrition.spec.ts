import { balanceOf, groupsOf } from "./nutrition";
import type { Meal } from "./types";

const meal = (dish: string, lines: string[] = []): Meal => ({ date: "2026-11-09", meal: "dinner", dish, recipeIngredients: lines });

describe("food groups of a meal", () => {
  it("sorts the usual dishes", () => {
    expect([...groupsOf("Saumon en papillote ; 2 filets de saumon ; 300 g de courgettes")].sort()).toEqual(["fish", "oilyFish", "vegetables"]);
    expect(groupsOf("Dahl de lentilles corail ; 200 g de lentilles corail ; 1 oignon").has("pulses")).toBe(true);
    expect(groupsOf("Pâtes carbonara ; 200 g de lardons ; 4 œufs").has("coldCuts")).toBe(true);
    expect(groupsOf("Pâtes carbonara ; 200 g de lardons ; 4 œufs").has("egg")).toBe(true);
    expect(groupsOf("Bœuf bourguignon ; 800 g de bœuf ; 3 carottes").has("redMeat")).toBe(true);
  });
  it("does not take one thing for another", () => {
    expect(groupsOf("Poulet rôti ; haricots verts").has("pulses")).toBe(false);
    expect(groupsOf("Steak de thon ; riz").has("redMeat")).toBe(false);
    expect(groupsOf("Rôti de dinde").has("redMeat")).toBe(false);
    expect(groupsOf("Salade verte ; sel, poivre").has("dairy")).toBe(false);
    expect(groupsOf("Riz cantonais ; sauce soja").has("pulses")).toBe(false);
    expect(groupsOf("Curry ; lait de coco").has("dairy")).toBe(false);
  });
});

describe("balance of a menu", () => {
  const week = [
    meal("Saumon en papillote", ["saumon", "courgettes"]), meal("Chili sin carne", ["haricots rouges", "tomates", "poivron"]),
    meal("Bœuf bourguignon", ["bœuf", "carottes"]), meal("Croque-monsieur", ["jambon", "pain de mie", "emmental"]),
    meal("Poulet basquaise", ["poulet", "poivrons", "tomates"]), meal("Omelette aux champignons", ["œufs", "champignons"]),
    meal("Cabillaud et purée", ["cabillaud", "pommes de terre"]),
  ];
  it("counts the groups against the guidelines brought to the period", () => {
    const b = balanceOf(week, 7);
    const g = Object.fromEntries(b.guidelines.map((x) => [x.group, x]));
    expect(g.fish).toMatchObject({ count: 2, min: 2, status: "ok" });
    expect(g.oilyFish).toMatchObject({ count: 1, status: "ok" });
    expect(g.pulses).toMatchObject({ count: 1, min: 2, status: "low" });
    expect(g.redMeat).toMatchObject({ count: 1, status: "ok" });
    expect(g.vegetables.status).toBe("low");   // the croque-monsieur and the cod without vegetables: 5 of 7
    expect(b.vegetarian).toBe(2);
  });
  it("asks less of a short period", () => {
    const b = balanceOf(week.slice(0, 3), 2);
    expect(b.guidelines.find((x) => x.group === "fish")!.min).toBe(0);
  });
});
