// Mealie (recipes backend, required): recipes, meal plan, shopping list and its labels (aisles). API token of a
// Mealie user (Mealie → profile → API tokens). Two addresses: the one Pantarr calls (internal), and the public one
// for the links and pictures shown in the browser.
import type { ConnectorContext, MealPlanEntry, RecipeSummary, RecipesConnector, ShoppingItem } from "@pantarr/connector-sdk";
import { minutesOf, RecipeTimes } from "../../planning/recipe-quantities";

export interface MealieLabel { id: string; name: string; color?: string }
export interface MealieList { id: string; name: string }
export interface MealieItem extends ShoppingItem { labelId?: string | null; position?: number }
export interface MealieRecipe {
  id: string; slug: string; name: string; orgURL?: string | null; recipeServings?: number; recipeYield?: string; totalTimeSeconds?: number | null;
  recipeIngredient?: { note?: string; display?: string; quantity?: number; [k: string]: unknown }[]; recipeInstructions?: unknown[];
  extras?: Record<string, string>;
}
export interface MealieOrganizer { id: string; name: string; slug: string }
export type OrganizerKind = "tags" | "categories";
export interface MealieRating { recipeId: string; rating: number | null; isFavorite: boolean }
export interface MealieMealPlan { id: number; date: string; entryType: string; title?: string; text?: string; recipeId?: string; recipe?: { name: string; slug: string } }

const base = (ctx: ConnectorContext) => String(ctx.settings.url ?? "").replace(/\/$/, "");
const publicBase = (ctx: ConnectorContext) => String(ctx.settings.publicUrl || ctx.settings.url || "").replace(/\/$/, "");

async function call<T>(ctx: ConnectorContext, method: string, path: string, body?: unknown, query: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  const r = await ctx.fetch(`${base(ctx)}${path}${qs ? "?" + qs : ""}`, {
    method, headers: { Authorization: `Bearer ${ctx.settings.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Mealie ${method} ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (r.status === 204 ? null : await r.json()) as T;
}

async function allPages<T>(ctx: ConnectorContext, path: string, query: Record<string, string | number> = {}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const d = await call<{ items: T[]; total_pages?: number; totalPages?: number }>(ctx, "GET", path, undefined, { ...query, page, perPage: 200 });
    out.push(...(d.items ?? []));
    if (page >= (d.total_pages ?? d.totalPages ?? 1)) return out;
  }
}

export const mealieConnector: RecipesConnector & {
  test(ctx: ConnectorContext): Promise<{ user: string; group: string }>;
  labels(ctx: ConnectorContext): Promise<MealieLabel[]>;
  shoppingLists(ctx: ConnectorContext): Promise<MealieList[]>;
  listItems(ctx: ConnectorContext, listId: string): Promise<MealieItem[]>;
  mealPlanEntries(ctx: ConnectorContext, from: string, to: string): Promise<MealieMealPlan[]>;
  deleteMealPlan(ctx: ConnectorContext, id: number): Promise<void>;
  ensureList(ctx: ConnectorContext): Promise<MealieList>;
  createLabel(ctx: ConnectorContext, name: string): Promise<MealieLabel>;
  /** Ids of the items, in order (Mealie may merge one into an identical item already there: « updatedItems »). */
  createItems(ctx: ConnectorContext, listId: string, items: { note: string; labelId?: string | null; checked?: boolean; extras?: Record<string, string> }[]): Promise<string[]>;
  setChecked(ctx: ConnectorContext, itemId: string, checked: boolean): Promise<MealieItem>;
  updateItem(ctx: ConnectorContext, itemId: string, patch: { note?: string; labelId?: string | null; checked?: boolean; extras?: Record<string, string> }): Promise<MealieItem>;
  deleteItem(ctx: ConnectorContext, itemId: string): Promise<void>;
  importUrl(ctx: ConnectorContext, url: string): Promise<string>;
  getRecipe(ctx: ConnectorContext, slug: string): Promise<MealieRecipe>;
  patchRecipe(ctx: ConnectorContext, slug: string, body: Partial<MealieRecipe>): Promise<MealieRecipe>;
  deleteRecipe(ctx: ConnectorContext, slug: string): Promise<void>;
  /** New empty recipe: its slug. */
  createRecipe(ctx: ConnectorContext, name: string): Promise<string>;
  setImage(ctx: ConnectorContext, slug: string, data: Buffer, extension: string): Promise<void>;
  organizers(ctx: ConnectorContext, kind: OrganizerKind): Promise<MealieOrganizer[]>;
  createOrganizer(ctx: ConnectorContext, kind: OrganizerKind, name: string): Promise<MealieOrganizer>;
  /** Favourites and ratings of the Mealie user of the token (the household's, in hosted mode). */
  ratings(ctx: ConnectorContext): Promise<MealieRating[]>;
  rate(ctx: ConnectorContext, slug: string, change: { rating?: number | null; isFavorite?: boolean }): Promise<void>;
} = {
  manifest: {
    id: "mealie", kind: "recipes", name: "Mealie", scope: "instance",
    description: "Required: recipes, meal plan and shopping list.",
    settings: {
      url: { type: "url", title: "Mealie URL (called by Pantarr)", required: true },
      publicUrl: { type: "url", title: "Public Mealie URL (links and pictures), if different" },
      token: { type: "string", title: "API token", secret: true, required: true },
      shoppingList: { type: "string", title: "Shopping list name", default: "Shopping" },
    },
  },

  async test(ctx) {
    const me = await call<{ fullName?: string; username?: string; group?: string }>(ctx, "GET", "/api/users/self");
    return { user: me.fullName || me.username || "?", group: me.group ?? "" };
  },

  async listRecipes(ctx) {
    const group = (await call<{ slug: string }>(ctx, "GET", "/api/groups/self")).slug;
    const items = await allPages<{ id: string; slug: string; name: string; recipeServings?: number | null; orgURL?: string | null; dateAdded?: string | null;
      tags?: { name: string }[] | null; recipeCategory?: { name: string }[] | null } & RecipeTimes>(ctx, "/api/recipes", { orderBy: "name", orderDirection: "asc" });
    return items.map((r) => ({ id: r.id, slug: r.slug, name: r.name, url: `${publicBase(ctx)}/g/${group}/r/${r.slug}`,
      minutes: minutesOf(r), servings: r.recipeServings || null, orgURL: r.orgURL ?? null, added: r.dateAdded ?? null,
      tags: (r.tags ?? []).map((t) => t.name), categories: (r.recipeCategory ?? []).map((c) => c.name),
      image: `${publicBase(ctx)}/api/media/recipes/${r.id}/images/min-original.webp` }) as RecipeSummary & { image: string });
  },

  async listMealPlan(ctx, from, to) {
    const items = await allPages<{ date: string; entryType: MealPlanEntry["meal"]; title?: string; recipeId?: string; text?: string }>(
      ctx, "/api/households/mealplans", { start_date: from, end_date: to });
    return items.map((x) => ({ date: x.date, meal: x.entryType, title: x.title, recipeId: x.recipeId, note: x.text }));
  },

  async mealPlanEntries(ctx, from, to) {
    return allPages<MealieMealPlan>(ctx, "/api/households/mealplans", { start_date: from, end_date: to });
  },

  async deleteMealPlan(ctx, id) {
    await call(ctx, "DELETE", `/api/households/mealplans/${id}`);
  },

  async writeMealPlan(ctx, entries) {
    for (const e of entries) await call(ctx, "POST", "/api/households/mealplans", { date: e.date, entryType: e.meal, title: e.title ?? "", text: e.note ?? "", recipeId: e.recipeId });
  },

  async labels(ctx) {
    return allPages<MealieLabel>(ctx, "/api/groups/labels");
  },

  async shoppingLists(ctx) {
    return allPages<MealieList>(ctx, "/api/households/shopping/lists");
  },

  async listItems(ctx, listId) {
    const l = await call<{ listItems: { id: string; note?: string; display?: string; checked: boolean; labelId?: string | null; extras?: Record<string, string>; position?: number }[] }>(
      ctx, "GET", `/api/households/shopping/lists/${listId}`);
    return (l.listItems ?? []).map((x) => ({ id: x.id, note: x.note || x.display || "", checked: x.checked, labelId: x.labelId, extras: x.extras, position: x.position }));
  },

  async listShoppingItems(ctx) {
    const name = String(ctx.settings.shoppingList || "Shopping");
    const list = (await this.shoppingLists(ctx)).find((l) => l.name === name);
    return list ? this.listItems(ctx, list.id) : [];
  },

  async upsertShoppingItems(ctx, items) {
    const list = await this.ensureList(ctx);
    await this.createItems(ctx, list.id, items.map((i) => ({ note: i.note, checked: i.checked, extras: i.extras })));
  },

  async ensureList(ctx) {
    const name = String(ctx.settings.shoppingList || "Shopping");
    return (await this.shoppingLists(ctx)).find((l) => l.name === name) ?? await call<MealieList>(ctx, "POST", "/api/households/shopping/lists", { name });
  },

  async createLabel(ctx, name) {
    return call<MealieLabel>(ctx, "POST", "/api/groups/labels", { name, color: "#9e9e9e" });
  },

  async createItems(ctx, listId, items) {
    if (!items.length) return [];
    const r = await call<{ createdItems?: { id: string }[]; updatedItems?: { id: string }[] } | null>(ctx, "POST", "/api/households/shopping/items/create-bulk", items.map((i) => ({
      shoppingListId: listId, note: i.note, quantity: 0, checked: !!i.checked, labelId: i.labelId ?? null, extras: i.extras ?? {} })));
    return [...(r?.createdItems ?? []), ...(r?.updatedItems ?? [])].map((x) => x.id);
  },

  async setChecked(ctx, itemId, checked) {
    const item = await call<Record<string, unknown>>(ctx, "GET", `/api/households/shopping/items/${itemId}`);
    await call(ctx, "PUT", `/api/households/shopping/items/${itemId}`, { ...item, checked });
    return { id: itemId, note: String(item.note ?? ""), checked, labelId: item.labelId as string | null, extras: item.extras as Record<string, string> };
  },

  async updateItem(ctx, itemId, patch) {
    const item = await call<Record<string, unknown>>(ctx, "GET", `/api/households/shopping/items/${itemId}`);
    const next = { ...item, ...patch, extras: { ...(item.extras as Record<string, string> ?? {}), ...(patch.extras ?? {}) } };
    if (patch.note !== undefined) Object.assign(next, { display: patch.note, foodId: null, unitId: null, quantity: 0, isFood: false });
    await call(ctx, "PUT", `/api/households/shopping/items/${itemId}`, next);
    return { id: itemId, note: String(next.note ?? ""), checked: !!next.checked, labelId: next.labelId as string | null, extras: next.extras };
  },

  async deleteItem(ctx, itemId) {
    await call(ctx, "DELETE", `/api/households/shopping/items/${itemId}`);
  },

  async importUrl(ctx, url) {
    return call<string>(ctx, "POST", "/api/recipes/create/url", { url, includeTags: true });
  },

  async getRecipe(ctx, slug) {
    return call<MealieRecipe>(ctx, "GET", `/api/recipes/${slug}`);
  },

  async patchRecipe(ctx, slug, body) {
    return call<MealieRecipe>(ctx, "PATCH", `/api/recipes/${slug}`, body);
  },

  async deleteRecipe(ctx, slug) {
    await call(ctx, "DELETE", `/api/recipes/${slug}`);
  },

  async createRecipe(ctx, name) {
    return call<string>(ctx, "POST", "/api/recipes", { name });
  },

  async setImage(ctx, slug, data, extension) {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(data)]), `image.${extension}`);
    form.append("extension", extension);
    const r = await ctx.fetch(`${base(ctx)}/api/recipes/${slug}/image`, { method: "PUT", headers: { Authorization: `Bearer ${ctx.settings.token}` }, body: form,
      signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`Mealie PUT image: ${r.status} ${(await r.text()).slice(0, 200)}`);
  },

  async organizers(ctx, kind) {
    return allPages<MealieOrganizer>(ctx, `/api/organizers/${kind}`, { orderBy: "name", orderDirection: "asc" });
  },

  async createOrganizer(ctx, kind, name) {
    return call<MealieOrganizer>(ctx, "POST", `/api/organizers/${kind}`, { name });
  },

  async ratings(ctx) {
    return (await call<{ ratings: MealieRating[] }>(ctx, "GET", "/api/users/self/ratings")).ratings ?? [];
  },

  async rate(ctx, slug, change) {
    const me = await call<{ id: string }>(ctx, "GET", "/api/users/self");
    await call(ctx, "POST", `/api/users/${me.id}/ratings/${slug}`, change);
  },
};
