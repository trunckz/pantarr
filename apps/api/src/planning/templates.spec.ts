import { age, daysList, DEFAULT_TEMPLATES, PLACEHOLDERS, render, season } from "./templates";

describe("prompt templates", () => {
  it("uses every placeholder in every language", () => {
    for (const [lang, t] of Object.entries(DEFAULT_TEMPLATES)) for (const p of PLACEHOLDERS) expect(`${lang}:${t.includes(`{{ ${p} }}`)}`).toBe(`${lang}:true`);
  });
  it("renders known placeholders and leaves unknown ones", () => {
    expect(render("A {{ x }} {{y}} {{ z }}", { x: "1", y: "2" })).toBe("A 1 2 {{ z }}");
  });
  it("gives ages in months under 2 years", () => {
    expect(age(new Date("2025-05-01"), "2026-11-09", "fr")).toBe("18 mois");
    expect(age(new Date("2023-05-01"), "2026-11-09", "fr")).toBe("3 ans");
    expect(age(new Date("2023-05-10"), "2025-05-09", "en")).toBe("23 months");
  });
  it("names seasons and days", () => {
    expect(season("2026-11-09", "fr")).toBe("automne");
    expect(daysList("2026-11-09", 2, "fr")).toBe("lundi 9 novembre (2026-11-09), mardi 10 novembre (2026-11-10)");
  });
});
