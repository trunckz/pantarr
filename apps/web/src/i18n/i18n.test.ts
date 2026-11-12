import { describe, expect, it } from "vitest";
import en from "./en.json";
import fr from "./fr.json";

// Every interface text must exist in every language (a missing key would show the raw key)
describe("interface translations", () => {
  it("has the same keys in English and French", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });
  it("keeps the same {{placeholders}}", () => {
    const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(vars(fr[k])).toEqual(vars(en[k]));
  });
});
