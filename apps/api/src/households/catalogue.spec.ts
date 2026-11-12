import { allergensIn, label, ALLERGENS } from "./catalogue";

describe("allergens", () => {
  it("lists the 14 EU allergens", () => expect(Object.keys(ALLERGENS)).toHaveLength(14));
  it("finds allergens in ingredient names, plural and accents included", () => {
    expect(allergensIn("Pâtes complètes", ["gluten", "peanuts"])).toEqual(["gluten"]);
    expect(allergensIn("Beurre de cacahuètes", ["peanuts", "milk"])).toEqual(["peanuts", "milk"]);
    expect(allergensIn("Courgettes", ["gluten", "milk"])).toEqual([]);
  });
  it("matches custom allergens by their name", () => {
    expect(allergensIn("Kiwis jaunes", ["kiwi"])).toEqual(["kiwi"]);
  });
  it("translates built-in codes and keeps custom names", () => {
    expect(label(ALLERGENS, "nuts", "fr")).toBe("fruits à coque");
    expect(label(ALLERGENS, "kiwi", "fr")).toBe("kiwi");
  });
});
