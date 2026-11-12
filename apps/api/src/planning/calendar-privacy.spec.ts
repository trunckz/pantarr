import { busyMeals } from "./calendar-privacy";

describe("Google Calendar without details for the planner", () => {
  const ev = (start: string, end: string, allDay = false) => ({ start, end, allDay, title: "secret", calendar: "Les babychoux" });
  it("keeps only the appointments during a meal, never a whole day nor a title", () => {
    const lines = busyMeals([
      ev("2026-11-09T17:10", "2026-11-09T18:20"), ev("2026-11-09T20:15", "2026-11-09T21:15"), ev("2026-11-10", "2026-11-12", true),
      ev("2026-11-12T17:00", "2026-11-12T18:00"), ev("2026-11-13T12:00", "2026-11-13T13:00"), ev("2026-11-14T10:00", "2026-11-14T11:30"),
      ev("2026-11-15T10:00", "2026-11-15T10:10")], true);
    expect(lines).toEqual([
      "- 2026-11-09 dîner : un membre du foyer a un rendez-vous de 20:15 à 21:15 (peut-être absent à ce repas, les autres mangent normalement)",
      "- 2026-11-13 déjeuner : un membre du foyer a un rendez-vous de 12:00 à 13:00 (peut-être absent à ce repas, les autres mangent normalement)",
    ]);
    expect(lines.join(" ")).not.toMatch(/secret|babychoux/);
  });
  it("counts an evening that goes on past midnight", () => {
    expect(busyMeals([ev("2026-11-14T19:30", "2026-11-15T01:00")], false)).toEqual(["- 2026-11-14 dinner: someone in the household has an appointment from 19:30 to midnight (maybe away for this meal, the others eat as usual)"]);
  });
});
