import { aisleFromWords } from "./aisle-words";
import { splitDictation } from "./list-sync.service";
import { plan } from "./sync";

const link = (externalId: string, itemId: string, extChecked = false, itemChecked = false) => ({ externalId, itemId, extChecked, itemChecked });

describe("list sync", () => {
  it("adds the new unchecked items from outside, and links the ones already in the list", () => {
    const p = plan([], [{ id: "k1", text: "Lait", checked: false }, { id: "k2", text: "pâtes", checked: false }, { id: "k3", text: "Vieux", checked: true }],
      [{ id: "m1", text: "Pâtes (500 g)", checked: false }]);
    expect(p.add).toEqual([{ id: "k1", text: "Lait", checked: false }]);
    expect(p.links).toEqual([link("k2", "m1")]);
  });
  it("follows the side that changed", () => {
    const p = plan([link("k1", "m1"), link("k2", "m2")],
      [{ id: "k1", text: "Lait", checked: true }, { id: "k2", text: "Pain", checked: false }],
      [{ id: "m1", text: "Lait", checked: false }, { id: "m2", text: "Pain", checked: true }]);
    expect(p.check).toEqual([{ itemId: "m1", checked: true }]);
    expect(p.external).toEqual([{ id: "k2", checked: true }]);
    expect(p.links).toEqual([link("k1", "m1", true, true), link("k2", "m2", true, true)]);
  });
  it("checks over there what left the list, and removes what was deleted over there unless bought", () => {
    const p = plan([link("k1", "m1"), link("k2", "m2"), link("k3", "m3")],
      [{ id: "k1", text: "Lait", checked: false }],
      [{ id: "m2", text: "Pain", checked: false }, { id: "m3", text: "Riz", checked: true }]);
    expect(p.external).toEqual([{ id: "k1", checked: true }]);
    expect(p.remove).toEqual(["m2"]);
    expect(p.links).toEqual([]);
  });
  it("changes nothing when both sides agree", () => {
    const p = plan([link("k1", "m1", true, true)], [{ id: "k1", text: "Lait", checked: true }], [{ id: "m1", text: "Lait", checked: true }]);
    expect(p).toMatchObject({ check: [], remove: [], external: [], add: [], links: [link("k1", "m1", true, true)] });
  });
});

describe("items from outside", () => {
  it("splits a dictation", () => {
    expect(splitDictation("lait, œufs et pain de mie", "fr")).toEqual(["Lait", "Œufs", "Pain de mie"]);
    expect(splitDictation("milk and eggs", "en")).toEqual(["Milk", "Eggs"]);
  });
  it("guesses the aisle from the words", () => {
    expect(aisleFromWords("Steak haché surgelé", "fr")).toBe("Surgelés");
    expect(aisleFromWords("Courgettes", "fr")).toBe("Fruits et légumes");
    expect(aisleFromWords("Thé vert", "fr")).toBe("Épicerie et féculents");
    expect(aisleFromWords("Gâteau", "fr")).toBe("Épicerie et féculents");
    expect(aisleFromWords("Ailes de poulet", "fr")).toBe("Boucherie et poissonnerie");
    expect(aisleFromWords("Frozen peas", "en")).toBe("Frozen");
    expect(aisleFromWords("Truc", "fr")).toBeNull();
  });
});
