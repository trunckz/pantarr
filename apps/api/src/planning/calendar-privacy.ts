// Google Calendar through the instance's own Google app (Google's « Limited Use » rules): no title nor calendar name
// goes to the planner. Without them a list of « busy » slots reads as absences everywhere, so Pantarr reads it first:
// a whole-day event says nothing about meals (holiday, birthday, reminder…) and is left out, a timed event only
// matters when it covers a meal time, and is then given as an uncertain presence at that meal.
export interface CalendarItem { start: string; end: string; allDay: boolean; title: string; calendar: string }

const MEALS = [{ meal: "lunch", from: "11:45", to: "13:45" }, { meal: "dinner", from: "18:45", to: "21:00" }] as const;
const hhmm = (s: string) => s.slice(11, 16);

/** Lines for the planner: one per meal covered by a busy slot, no detail of the events. */
export function busyMeals(events: CalendarItem[], fr: boolean): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.allDay || e.start.length < 16) continue;
    const day = e.start.slice(0, 10), from = hhmm(e.start), to = e.end.slice(0, 10) > day ? "24:00" : hhmm(e.end);
    for (const m of MEALS) {
      if (from >= m.to || to <= m.from) continue;
      const meal = fr ? (m.meal === "lunch" ? "déjeuner" : "dîner") : m.meal;
      out.push(fr ? `- ${day} ${meal} : un membre du foyer a un rendez-vous de ${from} à ${to === "24:00" ? "minuit" : to} (peut-être absent à ce repas, les autres mangent normalement)`
        : `- ${day} ${meal}: someone in the household has an appointment from ${from} to ${to === "24:00" ? "midnight" : to} (maybe away for this meal, the others eat as usual)`);
    }
  }
  return [...new Set(out)];
}

export const busyNote = (fr: boolean) => fr
  ? "(Agenda Google : seuls les rendez-vous qui tombent pendant un repas sont indiqués, sans détail ; ce ne sont pas des absences de tout le foyer, prévois les repas comme d'habitude.)"
  : "(Google Calendar: only the appointments during a meal are given, without detail; they are not absences of the whole household, plan the meals as usual.)";
