// Recipes shown and managed by Pantarr itself (page, edition, favourites, tags), Mealie staying behind: the households
// of a hosted instance never reach it. Pictures through Pantarr when the browsers cannot reach Mealie; a Mealie with a
// public address also gets an « open in Mealie » link.
import { randomUUID } from "node:crypto";
import type { ConnectorContext } from "@pantarr/connector-sdk";
import { config } from "../config";
import { minutesOf, type RecipeTimes } from "../planning/recipe-quantities";

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[a-z0-9-]+$)/i;   // « mealie », « db »… : names of a compose network

/** Whether the households' browsers cannot reach this Mealie. */
export function mealieIsPrivate(ctx: ConnectorContext): boolean {
  if (config.mode === "hosted") return true;
  if (ctx.settings.publicUrl) return false;
  try { return PRIVATE_HOST.test(new URL(String(ctx.settings.url ?? "")).hostname); } catch { return true; }
}

export const recipePage = (slug: string) => `/recipes/${encodeURIComponent(slug)}`;
export const recipeImage = (householdId: string, recipeId: string, size: "min" | "full" = "min") =>
  `/api/v1/households/${householdId}/recipes/${recipeId}/image${size === "full" ? "?size=full" : ""}`;

/** The links of a list of recipes: the Pantarr recipe page (Mealie's own page kept in « mealieUrl » when public), the
 * pictures through Pantarr when Mealie is private. */
export function presented<T extends { id: string; slug: string; url: string; image?: string }>(householdId: string, ctx: ConnectorContext, recipes: T[]): (T & { mealieUrl?: string })[] {
  const hidden = mealieIsPrivate(ctx);
  return recipes.map((r) => hidden ? { ...r, url: recipePage(r.slug), image: recipeImage(householdId, r.id) } : { ...r, url: recipePage(r.slug), mealieUrl: r.url });
}

export interface Raw extends RecipeTimes {
  id: string; slug: string; name: string; description?: string | null; orgURL?: string | null; recipeServings?: number | null; recipeYield?: string | null;
  prepTime?: string | null; performTime?: string | null; prepTimeSeconds?: number | null; performTimeSeconds?: number | null;
  recipeIngredient?: ({ title?: string | null; display?: string | null; note?: string | null } & Record<string, unknown>)[];
  recipeInstructions?: ({ title?: string | null; text?: string | null } & Record<string, unknown>)[];
  notes?: { title?: string | null; text?: string | null }[];
  tags?: { id?: string; name: string; slug?: string }[];
  recipeCategory?: { id?: string; name: string; slug?: string }[];
}

const ingredientText = (i: { display?: string | null; note?: string | null }) => String(i.display || i.note || "").trim();
/** Minutes of one time of a recipe (seconds, else its text). */
const minutesField = (seconds?: number | null, text?: string | null) => minutesOf({ totalTimeSeconds: seconds ?? null, totalTime: text ?? "" });

/** A Mealie recipe as the Pantarr recipe page shows it. */
export function recipeView(householdId: string, r: Raw) {
  const ingredients: { section?: string; text: string }[] = [];
  let section: string | undefined;
  for (const i of r.recipeIngredient ?? []) {
    if (i.title) section = i.title;
    const text = ingredientText(i);
    if (text) ingredients.push({ ...(section ? { section } : {}), text });
  }
  return {
    id: r.id, slug: r.slug, name: r.name, description: r.description ?? "", source: r.orgURL ?? null,
    image: recipeImage(householdId, r.id, "full"), minutes: minutesOf(r), servings: r.recipeServings || null, yield: r.recipeYield ?? "",
    prepMinutes: minutesField(r.prepTimeSeconds, r.prepTime), cookMinutes: minutesField(r.performTimeSeconds, r.performTime),
    totalMinutes: minutesField(r.totalTimeSeconds, r.totalTime),
    ingredients,
    steps: (r.recipeInstructions ?? []).map((s) => ({ title: s.title ?? "", text: String(s.text ?? "").trim() })).filter((s) => s.text),
    notes: (r.notes ?? []).map((n) => ({ title: n.title ?? "", text: String(n.text ?? "").trim() })).filter((n) => n.text),
    tags: (r.tags ?? []).map((t) => t.name),
    categories: (r.recipeCategory ?? []).map((c) => c.name),
  };
}

/** What the recipe editor sends. */
export interface RecipeEdit {
  name: string; description?: string; source?: string | null; servings?: number | null; yield?: string;
  prepMinutes?: number | null; cookMinutes?: number | null; totalMinutes?: number | null;
  ingredients: { section?: string; text: string }[]; steps: { title?: string; text: string }[]; notes: { title?: string; text: string }[];
  tags: string[]; categories: string[];
}

/** « 75 » → « 1 h 15 min » (the text Mealie shows). */
export function minutesText(m: number, locale = "fr"): string {
  const h = Math.floor(m / 60), r = m % 60;
  if (locale !== "fr") return [h ? `${h} h` : "", r ? `${r} min` : ""].filter(Boolean).join(" ") || "0 min";
  return h ? `${h} h${r ? ` ${String(r).padStart(2, "0")}` : ""}` : `${r} min`;
}

/** The Mealie fields of an edited recipe. The ingredients and steps not changed keep everything Mealie knows about them
 * (quantity, unit and food of a parsed ingredient, links of a step); a changed ingredient becomes a plain text one. */
export function recipePatch(r: Raw, e: RecipeEdit, organizers: { tags: { id: string; name: string; slug: string }[]; categories: { id: string; name: string; slug: string }[] }, locale = "fr") {
  const old = [...(r.recipeIngredient ?? [])];
  let section: string | undefined;
  const ingredients = e.ingredients.filter((x) => x.text.trim()).map((x) => {
    const title = (x.section ?? "").trim();
    const first = title !== (section ?? "");
    section = title;
    const at = old.findIndex((o) => o && ingredientText(o) === x.text.trim());
    const kept = at >= 0 ? old.splice(at, 1, undefined as never)[0] : null;
    const base = kept ?? { quantity: 0, unit: null, food: null, note: x.text.trim(), display: x.text.trim(), originalText: x.text.trim(), referenceId: randomUUID() };
    return { ...base, title: first ? title : "" };
  });
  const oldSteps = r.recipeInstructions ?? [];
  const steps = e.steps.filter((x) => x.text.trim()).map((x) => {
    const same = oldSteps.find((o) => String(o.text ?? "").trim() === x.text.trim());
    const base = same ?? { id: randomUUID(), ingredientReferences: [] };
    return { ...base, title: (x.title ?? "").trim(), text: x.text.trim() };
  });
  const time = (m: number | null | undefined) => (m && m > 0 ? { text: minutesText(Math.round(m), locale), seconds: Math.round(m) * 60 } : { text: null, seconds: null });
  const prep = time(e.prepMinutes), cook = time(e.cookMinutes);
  const total = e.totalMinutes && e.totalMinutes > 0 ? time(e.totalMinutes) : (prep.seconds || cook.seconds) ? time(((prep.seconds ?? 0) + (cook.seconds ?? 0)) / 60) : time(null);
  const pick = (names: string[], all: { id: string; name: string; slug: string }[]) =>
    [...new Set(names.map((n) => n.trim()).filter(Boolean))].map((n) => all.find((o) => o.name.toLowerCase() === n.toLowerCase())).filter((o): o is { id: string; name: string; slug: string } => !!o);
  return {
    name: e.name.trim(), description: (e.description ?? "").trim(), orgURL: e.source?.trim() || null,
    recipeServings: e.servings && e.servings > 0 ? e.servings : 0, recipeYield: (e.yield ?? "").trim(),
    prepTime: prep.text, prepTimeSeconds: prep.seconds, performTime: cook.text, performTimeSeconds: cook.seconds, totalTime: total.text, totalTimeSeconds: total.seconds,
    recipeIngredient: ingredients, recipeInstructions: steps,
    notes: e.notes.filter((n) => n.text.trim()).map((n) => ({ title: (n.title ?? "").trim(), text: n.text.trim() })),
    tags: pick(e.tags, organizers.tags), recipeCategory: pick(e.categories, organizers.categories),
  };
}
