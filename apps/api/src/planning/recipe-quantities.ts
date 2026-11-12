// What a meal really needs when it comes from a Mealie recipe: its time (from the recipe, not guessed by the model)
// and its ingredients, scaled from the servings of the recipe to the people who eat it (plus those who eat its
// leftovers). Ingredients imported from Jow and others are often plain text (« 320 g Brocoli (frais) »): the leading
// quantity is read and scaled ; a line without one is kept as it is and flagged.
import { leftoverEdges, mainEaters } from "./leftovers";
import type { Meal } from "./types";

export interface RecipeTimes { totalTimeSeconds?: number | null; prepTimeSeconds?: number | null; performTimeSeconds?: number | null;
  cookTimeSeconds?: number | null; totalTime?: string | null }

/** Minutes of a recipe: its total time, else prep + cooking, else the text (« 20 minutes », « 1 h 15 », « PT45M »). */
export function minutesOf(r: RecipeTimes): number | null {
  if (r.totalTimeSeconds) return Math.round(r.totalTimeSeconds / 60);
  const sum = (r.prepTimeSeconds ?? 0) + (r.performTimeSeconds ?? 0) + (r.cookTimeSeconds ?? 0);
  if (sum) return Math.round(sum / 60);
  const t = (r.totalTime ?? "").toLowerCase();
  const iso = /^pt(?:(\d+)h)?(?:(\d+)m)?/.exec(t);
  if (iso && (iso[1] || iso[2])) return +(iso[1] ?? 0) * 60 + +(iso[2] ?? 0);
  const h = /(\d+)\s*(?:h|heures?|hours?)/.exec(t)?.[1], m = /(\d+)\s*(?:min|minutes?|mn)/.exec(t)?.[1];
  if (h || m) return +(h ?? 0) * 60 + +(m ?? 0);
  return null;
}

const UNITS = ["kg", "g", "mg", "l", "dl", "cl", "ml", "càs", "càc", "c\\.? ?à ?s\\.?", "c\\.? ?à ?c\\.?", "cs", "cc", "cuill?\\.?(?:ères?)? à (?:soupe|café)",
  "bou\\.?", "bottes?", "gou\\.?", "gousses?", "pinc\\.?", "pincées?", "tranches?", "boîtes?", "sachets?", "pots?", "brins?", "feuilles?", "pièces?", "pcs?"];
const LINE = new RegExp(`^\\s*(\\d+(?:[.,]\\d+)?|\\d+\\s*/\\s*\\d+|[½¼¾⅓⅔])\\s*(${UNITS.join("|")})?(?=\\s|$)\\s*(?:de\\s+|d['’])?(.*)$`, "i");
const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
const WEIGHTS = /^(kg|g|mg|l|dl|cl|ml)$/i;

export interface Line { text: string; name: string; quantity: number | null; unit: string }

/** « 320 g Brocoli (frais) » → { quantity: 320, unit: "g", name: "Brocoli (frais)" } ; no quantity → quantity null. */
export function parseLine(text: string): Line {
  const m = LINE.exec(text);
  if (!m || !m[3]?.trim()) return { text, name: text.trim(), quantity: null, unit: "" };
  const raw = m[1].replace(",", ".");
  const quantity = FRACTIONS[raw] ?? (raw.includes("/") ? +raw.split("/")[0] / +raw.split("/")[1] : +raw);
  return { text, name: m[3].trim(), quantity: quantity > 0 ? quantity : null, unit: (m[2] ?? "").trim() };
}

const fmt = (n: number) => String(+n.toFixed(2)).replace(".", ",");
/** The line with its quantity multiplied ; grams and millilitres to the unit, the rest to the quarter. */
export function scaleLine(l: Line, factor: number): Line {
  if (l.quantity === null || Math.abs(factor - 1) < 0.01) return l;
  const q = WEIGHTS.test(l.unit) ? Math.max(1, Math.round(l.quantity * factor)) : Math.max(0.25, Math.round(l.quantity * factor * 4) / 4);
  return { ...l, quantity: q, text: `${fmt(q)}${l.unit ? " " + l.unit : ""} ${l.name}` };
}

export interface Eater { name: string; kind: string }
/** Servings for these people: an adult counts 1, a child ½ ; unknown names count as adults. */
export function servingsFor(names: string[] | undefined, members: Eater[]): number {
  if (!names?.length) return members.reduce((n, m) => n + (m.kind === "child" ? 0.5 : 1), 0) || 1;
  return names.reduce((n, x) => n + (members.find((m) => m.name.toLowerCase() === x.toLowerCase())?.kind === "child" ? 0.5 : 1), 0);
}

export interface RecipeDetail { servings: number | null; lines: string[] }

/** People eating the main dish of the meal, now or later as leftovers (whole meals, or one person's variant). */
export function eatersWithLeftovers(meals: Meal[], index: number): string[] {
  return [...mainEaters(meals[index]), ...leftoverEdges(meals).filter((e) => e.from === index).flatMap((e) => e.members)];
}

/** Scaled lines of the recipe of each meal (none for a meal that is itself leftovers, or that nobody eats as such). */
export function recipeLines(meals: Meal[], index: number, recipe: RecipeDetail | undefined, members: Eater[]): Line[] {
  if (!recipe || leftoverEdges(meals).some((e) => e.to === index && e.whole)) return [];
  const eaters = eatersWithLeftovers(meals, index);
  if (meals[index].for?.length && !eaters.length) return [];
  const factor = recipe.servings ? servingsFor(eaters, members) / recipe.servings : 1;
  return recipe.lines.filter((t) => t.trim()).map((t) => scaleLine(parseLine(t), factor));
}

/** Each meal with the scaled lines of its recipe (read once per recipe through « read ») ; a meal whose recipe cannot
 * be read is left as it is. */
export async function withRecipeLines(meals: Meal[], members: Eater[], slugOf: (m: Meal) => string | null | undefined,
                                      read: (slug: string) => Promise<RecipeDetail | null>): Promise<{ meal: Meal; lines: Line[] | null }[]> {
  const cache = new Map<string, RecipeDetail | null>();
  const out = [];
  for (const [i, m] of meals.entries()) {
    const slug = slugOf(m);
    if (slug && !cache.has(slug)) cache.set(slug, await read(slug).catch(() => null));
    const detail = slug ? cache.get(slug) : null;
    out.push({ meal: m, lines: detail ? recipeLines(meals, i, detail, members) : null });
  }
  return out;
}

/** The lines of a Mealie recipe as written there (structured or plain text). */
export const detailOf = (r: { recipeServings?: number | null; recipeIngredient?: { display?: string; note?: string }[] }): RecipeDetail =>
  ({ servings: r.recipeServings || null, lines: (r.recipeIngredient ?? []).map((x) => String(x.display || x.note || "")).filter(Boolean) });
