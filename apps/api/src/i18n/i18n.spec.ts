import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { languages, pickLocale, t } from "./i18n";

describe("API translations", () => {
  it("has the same keys in every language", () => {
    const files = readdirSync(__dirname).filter((f) => f.endsWith(".json"));
    const keys = files.map((f) => Object.keys(JSON.parse(readFileSync(join(__dirname, f), "utf8"))).sort());
    for (const k of keys) expect(k).toEqual(keys[0]);
    expect(languages).toEqual(expect.arrayContaining(["en", "fr"]));
  });
  it("picks the language from Accept-Language", () => {
    expect(pickLocale("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(pickLocale("de-DE,de;q=0.9")).toBe("en");
    expect(pickLocale(undefined, "fr")).toBe("fr");
  });
  it("falls back to English then to the key", () => {
    expect(t("auth.invalid", "fr")).toMatch(/incorrect/);
    expect(t("auth.invalid", "xx")).toBe(t("auth.invalid", "en"));
    expect(t("does.not.exist", "fr")).toBe("does.not.exist");
  });
});
