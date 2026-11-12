// Leftovers between the meals of a draft. A whole meal eaten again later: « leftovers_from » on the later meal (or
// « leftovers_for » on the first one, believed only when the later dish is the same or says « restes »). One person
// eating leftovers while the others eat something else: « leftovers_from » on that person's variant (drafts made
// before: « Repas de restes : … (du 2026-11-09 dinner) » in its text). Meals are named « YYYY-MM-DD dinner » ; the
// model sometimes writes it in the household's language (« soir », « déjeuner »…), a date alone means the dinner.
import { key } from "../common/text";
import type { Adjustment, Meal } from "./types";

export interface Slot { date: string; meal: "lunch" | "dinner" }
export interface Links { feeds: number[]; fedBy: number[] }
/** « from » cooks for « to » ; whole: the whole later meal is leftovers, else only « members » eat them. */
export interface Edge { from: number; to: number; whole: boolean; members: string[] }

const LUNCH = /\b(lunch|midi|d[ée]jeuner|noon)\b/i;
const LEFTOVERS = /\b(restes?|leftovers?)\b/i;

export function slotOf(text: string | null | undefined): Slot | null {
  const date = /(\d{4}-\d{2}-\d{2})/.exec(text ?? "")?.[1];
  if (!date) return null;
  return { date, meal: LUNCH.test(text ?? "") ? "lunch" : "dinner" };
}

export const slotText = (m: Pick<Meal, "date" | "meal">) => `${m.date} ${m.meal}`;

/** Meal whose leftovers this variant eats. */
export const variantFrom = (a: Adjustment): Slot | null => slotOf(a.leftovers_from) ?? (LEFTOVERS.test(a.text ?? "") ? slotOf(a.text) : null);

/** The people who eat the main dish of the meal: not those with their own dish or eating leftovers. */
export function mainEaters(m: Meal): string[] {
  const apart = new Set((m.adjustments ?? []).filter((a) => a.replaces || variantFrom(a)).map((a) => key(a.member)));
  return (m.for ?? []).filter((p) => !apart.has(key(p)));
}

export function leftoverEdges(meals: Meal[]): Edge[] {
  const index = (s: Slot | null) => (s ? meals.findIndex((m) => m.date === s.date && m.meal === s.meal) : -1);
  const edges: Edge[] = [];
  const add = (from: number, to: number, whole: boolean, members: string[]) => {
    if (from < 0 || to < 0 || from === to) return;
    const e = edges.find((x) => x.from === from && x.to === to && x.whole === whole);
    if (e) e.members.push(...members.filter((p) => !e.members.includes(p)));
    else edges.push({ from, to, whole, members: [...members] });
  };
  meals.forEach((m, i) => {
    add(index(slotOf(m.leftovers_from)), i, true, mainEaters(m));
    for (const a of m.adjustments ?? []) add(index(variantFrom(a)), i, false, [a.member]);
  });
  meals.forEach((m, i) => {   // said only by the meal that cooks: believed when the later dish is the same or is leftovers
    const to = index(slotOf(m.leftovers_for));
    if (to < 0 || edges.some((e) => e.from === i && e.to === to)) return;
    if (LEFTOVERS.test(meals[to].dish) || key(meals[to].dish) === key(m.dish)) add(i, to, true, mainEaters(meals[to]));
  });
  return edges;
}

/** For each meal: the meals that eat its leftovers (feeds) and the meals whose leftovers it eats (fedBy). */
export function leftoverLinks(meals: Meal[]): Links[] {
  const out: Links[] = meals.map(() => ({ feeds: [], fedBy: [] }));
  for (const e of leftoverEdges(meals)) {
    if (!out[e.from].feeds.includes(e.to)) out[e.from].feeds.push(e.to);
    if (!out[e.to].fedBy.includes(e.from)) out[e.to].fedBy.push(e.from);
  }
  return out;
}

const order = (s: Pick<Meal, "date" | "meal">) => `${s.date} ${s.meal === "lunch" ? 0 : 1}`;

/** Meals that would eat the leftovers of a meal coming later (or of themselves), or cook « leftovers for » an earlier
 * one: the model sometimes takes a weekend batch for the Monday before it. */
export function backwardMeals(meals: Meal[]): number[] {
  const bad = new Set<number>();
  meals.forEach((m, i) => {
    const later = (s: Slot | null) => !!s && order(s) >= order(m);
    if (later(slotOf(m.leftovers_from)) || (m.adjustments ?? []).some((a) => later(variantFrom(a)))) bad.add(i);
    const to = slotOf(m.leftovers_for);
    if (to && order(to) <= order(m)) bad.add(i);
  });
  return [...bad].sort((a, b) => a - b);
}

/** Last resort: the impossible links are forgotten (the meal is then a dish of its own). */
export function dropBackward(meals: Meal[]): number {
  let n = 0;
  for (const m of meals) {
    const later = (s: Slot | null) => !!s && order(s) >= order(m);
    if (later(slotOf(m.leftovers_from))) { m.leftovers_from = null; n++; }
    const to = slotOf(m.leftovers_for);
    if (to && order(to) <= order(m)) { m.leftovers_for = null; n++; }
    for (const a of m.adjustments ?? []) if (later(variantFrom(a))) { a.leftovers_from = null; n++; }
  }
  return n;
}
