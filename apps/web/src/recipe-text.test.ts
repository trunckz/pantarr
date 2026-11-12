import { describe, expect, it } from "vitest";
import { ingredientsOf, ingredientsText } from "./recipe-text";

describe("ingredients of the recipe editor", () => {
  const list = [{ text: "400 g Spaghetti" }, { section: "Sauce", text: "4 Jaunes d'œuf" }, { section: "Sauce", text: "50 g Pecorino" }];
  it("writes one per line, with the sections", () => {
    expect(ingredientsText(list)).toBe("400 g Spaghetti\n# Sauce\n4 Jaunes d'œuf\n50 g Pecorino");
  });
  it("reads them back, ignoring empty lines and list marks", () => {
    expect(ingredientsOf("400 g Spaghetti\n\n## Sauce\n- 4 Jaunes d'œuf\n• 50 g Pecorino\n")).toEqual(list);
  });
});
