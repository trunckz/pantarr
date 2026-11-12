// Shopping list, kept by Pantarr (it was in Mealie until 11/2026: each household's items and aisles are copied once,
// with their ids, so the links of the shared lists stay): ingredients of the meals of a period, consolidated by the LLM
// (same ingredient written differently, quantities as they are bought, leftovers, stock, purchase rules ; without an
// LLM: summed by name and unit, pantry staples left out), each with its aisle and where it is bought (in store or
// online, from the aisle unless moved by hand); manual items; check, « we already have it » (removed), clear the
// checked ones. Mealie is only used for the recipes of the meals.
import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type { ConnectorContext } from "@pantarr/connector-sdk";
import { ConnectorsService } from "../connectors/connectors.service";
import { mealieConnector } from "../connectors/mealie/mealie.connector";
import { settingsOf } from "../households/households.defaults";
import { AppError } from "../i18n/i18n";
import { key } from "../common/text";
import { JobsService } from "../jobs/jobs.service";
import type { PantryService } from "../pantry/pantry.service";
import { LlmService } from "../planning/llm.service";
import { detailOf, parseLine, withRecipeLines } from "../planning/recipe-quantities";
import { leftoverEdges, variantFrom } from "../planning/leftovers";
import type { Answer, Ingredient, Meal } from "../planning/types";
import { Prisma, type ShoppingItem } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type Area = "in-store" | "online";
export const OTHER_AISLE: Record<string, string> = { fr: "Autre", en: "Other" };

export interface Need { name: string; unit: string; quantity: number | null; aisle: string; dishes: string[] }

/** Ingredients of the meals summed by name and unit; a quantity missing on one line makes the total unknown. */
export function aggregate(meals: Answer["meals"], staples: string[]): Need[] {
  const out = new Map<string, Need>();
  const pantry = staples.map(key).filter(Boolean);
  for (const m of meals) for (const i of m.ingredients ?? []) {
    const name = (i.name ?? "").trim();
    if (!name || pantry.some((p) => key(name) === p || key(name).startsWith(p + " "))) continue;
    const unit = (i.unit ?? "").trim(), k = `${key(name)}|${key(unit)}`;
    const n = out.get(k) ?? { name: name[0].toUpperCase() + name.slice(1), unit, quantity: 0, aisle: i.aisle ?? "", dishes: [] };
    n.quantity = typeof i.quantity === "number" && n.quantity !== null ? n.quantity + i.quantity : null;
    if (!n.dishes.includes(m.dish)) n.dishes.push(m.dish);
    out.set(k, n);
  }
  return [...out.values()].sort((a, b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name));
}

/** One ingredient to buy and where it comes from (« Pâtes carbonara », « Pâtes carbonara · variante Emma »). */
export interface Source { from: string; text: string; name: string; quantity: number | null; unit: string; aisle?: string }

/** Everything the meals need, already scaled and with the leftovers taken into account: the lines of the recipes,
 * the side dishes of the meals, the ingredients of the people's variants (none for a variant eating leftovers). */
export function sourcesOf(meals: Meal[], locale: string): Source[] {
  const variant = locale === "fr" ? "variante" : "variant";
  const wholeLeftovers = new Set(leftoverEdges(meals).filter((e) => e.whole).map((e) => e.to));
  const out: Source[] = [];
  const add = (from: string, i: Ingredient) => {
    const name = (i.name ?? "").trim();
    if (!name) return;
    const quantity = typeof i.quantity === "number" && i.quantity > 0 ? i.quantity : null, unit = (i.unit ?? "").trim();
    out.push({ from, name, quantity, unit, aisle: i.aisle, text: quantity ? `${+quantity.toFixed(2)}${unit ? " " + unit : ""} ${name}` : name });
  };
  meals.forEach((m, i) => {
    for (const t of m.recipeIngredients ?? []) { const l = parseLine(t); out.push({ from: m.dish, text: t, name: l.name, quantity: l.quantity, unit: l.unit }); }
    if (!wholeLeftovers.has(i)) for (const x of m.ingredients ?? []) add(m.dish, x);
    for (const a of m.adjustments ?? []) if (!variantFrom(a)) for (const x of a.ingredients ?? []) add(`${m.dish} · ${variant} ${a.member}`, x);
  });
  return out;
}

/** The request to the LLM: the ingredients to buy (no menu, nothing to imagine) → the list as it is bought. */
export function shoppingPrompt(sources: Source[], o: { locale: string; staples: string[]; rules: string[]; aisles: string[]; stock: string[]; already: string[] }): string {
  const fr = o.locale === "fr", none = fr ? "(aucun)" : "(none)";
  const data = JSON.stringify(sources.map((x) => ({ [fr ? "pour" : "for"]: x.from, ingredient: x.text })));
  const list = (x: string[]) => x.join(", ") || none;
  return fr ? `Tu prépares la liste de courses d'un foyer à partir des ingrédients ci-dessous (JSON). Ils sont déjà adaptés au nombre de personnes et aux restes.

## Ingrédients
${data}

## Règles
- N'ajoute RIEN qui ne soit pas dans ces ingrédients : pas d'ingrédient deviné d'après le nom d'un plat, pas d'accompagnement, pas de condiment en plus.
- Garde chaque ingrédient avec sa quantité ; additionne un même ingrédient écrit de plusieurs façons (singulier ou pluriel, « oignon jaune » et « oignons », accents), en convertissant les unités quand c'est possible.
- Exprime chaque quantité comme on l'achète : « 3 courgettes » plutôt que « 600 g », un paquet, une boîte, une botte…
- Laisse de côté les produits de base du placard, sauf s'il en faut une grande quantité : ${list(o.staples)}
- Laisse de côté ce que le foyer a déjà en stock : ${list(o.stock)}
- Ne remets pas ce qui est déjà sur la liste : ${list(o.already)}
- Habitudes d'achat du foyer, à appliquer :
${o.rules.map((r) => `  - ${r}`).join("\n") || "  " + none}
- Rayon de chaque article (« aisle »), parmi : ${list(o.aisles)}
- « dishes » : les valeurs « pour » des ingrédients regroupés dans l'article, recopiées telles quelles.

## Réponse
Uniquement du JSON, textes en français :
{ "items": [{ "name": "Courgettes", "quantity": 3, "unit": "", "aisle": "${o.aisles[0] ?? "Fruits et légumes"}", "dishes": ["…"] }], "remarks": "doutes éventuels" }`
  : `You prepare the shopping list of a household from the ingredients below (JSON). They are already scaled to the number of people and the leftovers.

## Ingredients
${data}

## Rules
- Add NOTHING that is not among these ingredients: no ingredient guessed from a dish name, no side dish, no extra condiment.
- Keep every ingredient with its quantity; add up one ingredient written in several ways (singular or plural, "yellow onion" and "onions"), converting units when possible.
- Give each quantity as it is bought: "3 courgettes" rather than "600 g", a pack, a tin, a bunch…
- Leave out the pantry staples, unless a large amount is needed: ${list(o.staples)}
- Leave out what the household already has in stock: ${list(o.stock)}
- Do not add again what is already on the list: ${list(o.already)}
- Purchase rules of the household, to apply:
${o.rules.map((r) => `  - ${r}`).join("\n") || "  " + none}
- Aisle of each item ("aisle"), among: ${list(o.aisles)}
- "dishes": the "for" values of the ingredients merged into the item, copied as they are.

## Answer
JSON only:
{ "items": [{ "name": "Courgettes", "quantity": 3, "unit": "", "aisle": "${o.aisles[0] ?? "Fruit and vegetables"}", "dishes": ["…"] }], "remarks": "doubts if any" }`;
}

const STOP = new Set(["de", "des", "du", "la", "le", "les", "aux", "avec", "sans", "pour", "frais", "fraiche", "fraiches", "surgele", "surgelee",
  "surgelees", "surgeles", "rape", "rapee", "morceaux", "poudre", "tranche", "tranches", "entier", "entiere", "the", "and", "with", "fresh", "frozen"]);
const words = (s: string) => key(s.replace(/œ/gi, "oe").replace(/æ/gi, "ae")).split(" ").filter((w) => w.length >= 3 && !STOP.has(w)).map((w) => w.replace(/(s|x)$/, ""));

/** Items of the answer that match none of the ingredients given (invented): left out. */
export function invented(needs: Need[], sources: Source[]): Need[] {
  const known = new Set(sources.flatMap((x) => words(x.name)));
  return needs.filter((n) => { const w = words(n.name); return w.length > 0 && !w.some((x) => known.has(x)); });
}

/** Aisles of a household with no Mealie labels yet (a new household): those of a usual supermarket. */
export const DEFAULT_AISLES: Record<string, string[]> = {
  fr: ["Fruits et légumes", "Boucherie", "Poissonnerie", "Crèmerie", "Fromages", "Charcuterie", "Boulangerie", "Épicerie salée", "Épicerie sucrée", "Surgelés", "Boissons", "Hygiène", "Entretien", "Bébé"],
  en: ["Fruit and vegetables", "Meat", "Fish", "Dairy", "Cheese", "Deli", "Bakery", "Savoury groceries", "Sweet groceries", "Frozen", "Drinks", "Hygiene", "Household", "Baby"],
};
/** Words of the prompt's example the model sometimes copies as an aisle: never an aisle. */
const PLACEHOLDER_AISLE = /^(un des rayons|one of the aisles)$/i;
/** The aisles to propose: the household's labels, with the usual ones while it has only a few (a new household has
 * one or two made by a first list: everything would go there) ; the copied placeholder never. */
export function aislesFor(labels: string[], locale: string): string[] {
  const real = labels.filter((l) => !PLACEHOLDER_AISLE.test(l.trim()));
  if (real.length >= 6) return real;
  const usual = (DEFAULT_AISLES[locale] ?? DEFAULT_AISLES.en).filter((d) => !real.some((r) => key(r) === key(d)));
  return [...real, ...usual];
}

/** The answer of the LLM as needs ; null when it is not a usable list. An aisle not among « aisles » is left empty. */
export function needsOf(json: unknown, aisles?: string[]): Need[] | null {
  const known = aisles ? new Map(aisles.map((a) => [key(a), a])) : null;
  const aisleOf = (a: unknown) => (typeof a !== "string" || PLACEHOLDER_AISLE.test(a.trim()) ? "" : known ? known.get(key(a)) ?? "" : a);
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return null;
  const out = items.filter((i) => i && typeof i.name === "string" && i.name.trim()).map((i): Need => ({
    name: i.name.trim()[0].toUpperCase() + i.name.trim().slice(1), unit: typeof i.unit === "string" ? i.unit.trim() : "",
    quantity: typeof i.quantity === "number" && i.quantity > 0 ? i.quantity : null, aisle: aisleOf(i.aisle),
    dishes: Array.isArray(i.dishes) ? i.dishes.filter((d: unknown) => typeof d === "string") : [] }));
  return out.length || !items.length ? out : null;
}

export const noteOf = (n: Need) => (n.quantity ? `${n.name} (${+n.quantity.toFixed(2)}${n.unit ? " " + n.unit : ""})` : n.name);

/** What callers get back for one item (text as « note », Pantarr's data as « extras »: the pantry reads them). */
export interface ItemView { id: string; note: string; checked: boolean; extras: Record<string, string> }
const extrasOf = (x: ShoppingItem) => ({ ...(x.extras as Record<string, string>), pantarr_origin: x.origin });
const viewOf = (x: ShoppingItem): ItemView => ({ id: x.id, note: x.text, checked: x.checked, extras: extrasOf(x) });
/** Pantarr's own fields among the extras given by a caller: origin and area have their columns. */
const split = (extras: Record<string, string>) => {
  const { pantarr_origin: origin, pantarr_area: area, ...rest } = extras;
  return { origin, area: area === "in-store" || area === "online" ? area : undefined, rest };
};

@Injectable()
export class ShoppingService {
  private log = new Logger("shopping");
  constructor(private prisma: PrismaService, private connectors: ConnectorsService, private ai: LlmService, private jobs: JobsService, private refs: ModuleRef) {}

  private async ctx(householdId: string) {
    await this.ready(householdId);
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    return { h, s: settingsOf(h) };
  }

  // ── The copy from Mealie, once per household ──
  private copying = new Map<string, Promise<void>>();
  /** The household's list is here: copied from its Mealie list the first time (items with their ids, aisles = labels),
   * else started with the usual aisles of its language. A Mealie that does not answer: tried again next time. */
  async ready(householdId: string): Promise<void> {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    if ((h.settings as { shoppingStore?: string }).shoppingStore === "pantarr") return;
    const running = this.copying.get(householdId);
    if (running) return running;
    const p = this.copy(householdId).finally(() => this.copying.delete(householdId));
    this.copying.set(householdId, p);
    return p;
  }

  private async copy(householdId: string) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    const mealie = await this.connectors.context(householdId, "mealie", h.locale);
    let items: Prisma.ShoppingItemCreateManyInput[] = [], labels: string[] = [];
    if (mealie) {
      const names = new Map((await mealieConnector.labels(mealie)).map((l) => [l.id, l.name]));
      labels = [...names.values()].filter((n) => !PLACEHOLDER_AISLE.test(n.trim()));
      const wanted = String(mealie.settings.shoppingList || "Shopping");
      const list = (await mealieConnector.shoppingLists(mealie)).find((l) => l.name === wanted);
      const rows = list ? await mealieConnector.listItems(mealie, list.id) : [];
      items = rows.filter((x) => x.id && x.note.trim()).map((x, n) => {
        const named = (x.labelId && names.get(x.labelId)) || "";
        const { origin, area, rest } = split(x.extras ?? {});
        return { id: x.id!, householdId, text: x.note.trim(), checked: x.checked, aisle: PLACEHOLDER_AISLE.test(named.trim()) ? "" : named,
          area: area ?? null, origin: origin ?? "mealie", extras: rest, position: x.position ?? n };
      });
    }
    const aisles = aislesFor(labels, h.locale);
    await this.prisma.$transaction(async (tx) => {
      const now = await tx.household.findUniqueOrThrow({ where: { id: householdId } });
      if ((now.settings as { shoppingStore?: string }).shoppingStore === "pantarr") return;
      await tx.shoppingItem.createMany({ data: items, skipDuplicates: true });
      await tx.aisle.createMany({ data: aisles.map((name, position) => ({ householdId, name, position })), skipDuplicates: true });
      await tx.household.update({ where: { id: householdId }, data: { settings: { ...(now.settings as object), shoppingStore: "pantarr" } as Prisma.InputJsonValue } });
    });
    this.log.log(`${householdId}: shopping list kept by Pantarr (${items.length} items${mealie ? " copied from Mealie" : ""}, ${aisles.length} aisles)`);
  }

  // ── Aisles ──
  /** The household's aisles, in its order. */
  async aisles(householdId: string): Promise<{ id: string; name: string; position: number }[]> {
    await this.ready(householdId);
    return this.prisma.aisle.findMany({ where: { householdId }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true, position: true } });
  }

  /** The aisle of that name (accents and case ignored), added at the end when it is new. */
  private async aisleFor(householdId: string, name: string): Promise<string> {
    const clean = name.trim().slice(0, 80);
    const all = await this.prisma.aisle.findMany({ where: { householdId }, select: { name: true, position: true } });
    const found = all.find((a) => key(a.name) === key(clean));
    if (found) return found.name;
    await this.prisma.aisle.createMany({ data: [{ householdId, name: clean, position: Math.max(-1, ...all.map((a) => a.position)) + 1 }], skipDuplicates: true });
    return clean;
  }

  async addAisle(householdId: string, name: string) {
    await this.ready(householdId);
    await this.aisleFor(householdId, name);
    return this.aisles(householdId);
  }

  /** Renamed: its items and its place (in store / online) follow. */
  async renameAisle(householdId: string, id: string, name: string) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    const a = await this.prisma.aisle.findFirst({ where: { id, householdId } });
    if (!a) throw new AppError(404, "aisles.notFound");
    const clean = name.trim().slice(0, 80);
    if (!clean) throw new AppError(400, "aisles.empty");
    if (await this.prisma.aisle.findFirst({ where: { householdId, name: clean, id: { not: id } } })) throw new AppError(409, "aisles.exists");
    const s = settingsOf(h), areas = { ...s.storeAreas };
    if (areas[a.name]) { areas[clean] = areas[a.name]; delete areas[a.name]; }
    await this.prisma.$transaction([
      this.prisma.aisle.update({ where: { id }, data: { name: clean } }),
      this.prisma.shoppingItem.updateMany({ where: { householdId, aisle: a.name }, data: { aisle: clean } }),
      this.prisma.household.update({ where: { id: householdId }, data: { settings: { ...(h.settings as object), storeAreas: areas } as Prisma.InputJsonValue } }),
    ]);
    return this.aisles(householdId);
  }

  /** Removed: its items go without an aisle. */
  async removeAisle(householdId: string, id: string) {
    const a = await this.prisma.aisle.findFirst({ where: { id, householdId } });
    if (!a) throw new AppError(404, "aisles.notFound");
    await this.prisma.$transaction([
      this.prisma.aisle.delete({ where: { id } }),
      this.prisma.shoppingItem.updateMany({ where: { householdId, aisle: a.name }, data: { aisle: "" } }),
    ]);
    return this.aisles(householdId);
  }

  /** New order of the aisles (the order of the store): ids from first to last. */
  async orderAisles(householdId: string, ids: string[]) {
    const mine = new Set((await this.prisma.aisle.findMany({ where: { householdId }, select: { id: true } })).map((a) => a.id));
    await this.prisma.$transaction(ids.filter((x) => mine.has(x)).map((x, position) => this.prisma.aisle.update({ where: { id: x }, data: { position } })));
    return this.aisles(householdId);
  }

  async list(householdId: string) {
    const { h, s } = await this.ctx(householdId);
    const [rows, aisles] = await Promise.all([
      this.prisma.shoppingItem.findMany({ where: { householdId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
      this.aisles(householdId),
    ]);
    const items = rows.map((x) => {
      const e = x.extras as Record<string, string>;
      const area: Area = (x.area as Area | null) ?? s.storeAreas[x.aisle] ?? s.defaultArea;
      return { id: x.id, text: x.text, checked: x.checked, aisle: x.aisle, area, origin: x.origin, dishes: e.pantarr_dishes ?? "", product: e.pantarr_product ?? "" };
    });
    return { list: h.locale === "fr" ? "Courses" : "Shopping", aisles: aisles.map((a) => a.name), items };
  }

  /** Ingredients of the draft of a period → list, prepared by the LLM in the background (job) ; the unchecked items of
   * a previous addition are replaced. Without a usable LLM answer, the plain sum of the ingredients. */
  async fromMeals(householdId: string, start: string) {
    const draft = await this.prisma.mealPlanDraft.findUnique({ where: { householdId_start: { householdId, start: new Date(start) } } });
    if (!draft) throw new AppError(404, "planning.noDraft");
    return this.jobs.start("shopping", `shopping:${householdId}:${start}`, householdId, { start }, () => this.build(householdId, start));
  }

  async build(householdId: string, start: string) {
    const draft = await this.prisma.mealPlanDraft.findUniqueOrThrow({ where: { householdId_start: { householdId, start: new Date(start) } } });
    const { h, s } = await this.ctx(householdId);
    const mealie = await this.connectors.context(householdId, "mealie", h.locale);   // the recipes of the meals, when there is a Mealie
    const meals = mealie ? await this.withRecipes(householdId, mealie, (draft.answer as unknown as Answer).meals ?? []) : (draft.answer as unknown as Answer).meals ?? [];
    const current = await this.prisma.shoppingItem.findMany({ where: { householdId } });
    const labels = await this.aisles(householdId);
    const sources = sourcesOf(meals, h.locale);
    let needs: Need[] | null = null, remarks = "", error: string | null = null, dropped: string[] = [];
    try {
      const pantry = this.refs.get<PantryService>((await import("../pantry/pantry.service")).PantryService, { strict: false });
      const stock = ((await pantry.inventory(householdId)) ?? []).filter((x) => x.quantity > 0).map((x) => `${x.product} (${x.quantity})`);
      const rules = (await this.prisma.purchaseRule.findMany({ where: { householdId }, orderBy: { position: "asc" } })).map((r) => r.text);
      const already = current.filter((x) => !x.checked && x.origin !== "meal").map((x) => x.text);
      const aisles = aislesFor(labels.map((l) => l.name), h.locale);
      const json = await this.ai.complete(householdId, h.locale, "shopping", shoppingPrompt(sources, { locale: h.locale, staples: s.pantryStaples, rules,
        aisles, stock, already }));
      needs = needsOf(json, aisles);
      if (needs) {   // what the model added on its own is left out
        const extra = invented(needs, sources);
        dropped = extra.map((n) => n.name);
        needs = needs.filter((n) => !extra.includes(n));
        if (dropped.length) this.log.warn(`LLM list for ${householdId} ${start}: left out ${dropped.join(", ")}`);
      }
      remarks = String((json as { remarks?: unknown })?.remarks ?? "");
      if (!needs) error = "invalid answer";
    } catch (e) {
      error = String((e as { key?: string }).key ?? (e as Error).message);
      this.log.warn(`LLM list for ${householdId} ${start}: ${error}`);
    }
    const llm = !!needs;
    needs ??= aggregate(sources.map((x) => ({ date: "", meal: "dinner" as const, dish: x.from, ingredients: [{ name: x.name, quantity: x.quantity, unit: x.unit, aisle: x.aisle }] })),
      s.pantryStaples);
    const items: Prisma.ShoppingItemCreateManyInput[] = [];
    let position = Math.max(0, ...current.map((x) => x.position)) + 1;
    for (const n of needs) {
      const aisle = await this.aisleFor(householdId, n.aisle || OTHER_AISLE[h.locale] || OTHER_AISLE.en);
      items.push({ householdId, text: noteOf(n), aisle, origin: "meal", extras: { pantarr_dishes: n.dishes.join(", ").slice(0, 200) }, position: position++ });
    }
    // the unchecked items of a previous addition are replaced
    await this.prisma.$transaction([
      this.prisma.shoppingItem.deleteMany({ where: { householdId, origin: "meal", checked: false } }),
      this.prisma.shoppingItem.createMany({ data: items }),
    ]);
    return { items: items.length, llm, remarks, error, dropped };
  }

  /** The meals with the ingredients of their Mealie recipe as it is now, scaled to the people (and leftovers) ; the
   * model's own ingredients kept only as additions (drafts made before: dropped when the recipe is known). */
  private async withRecipes(householdId: string, mealie: ConnectorContext, meals: Meal[]): Promise<Meal[]> {
    if (!meals.some((m) => m.recipeId || m.recipeSlug)) return meals;
    const members = await this.prisma.member.findMany({ where: { householdId } });
    const slugs = new Map((await mealieConnector.listRecipes(mealie)).map((r) => [r.id, r.slug]));
    const done = await withRecipeLines(meals, members, (m) => m.recipeSlug ?? (m.recipeId ? slugs.get(m.recipeId) : undefined), async (slug) => {
      try { return detailOf(await mealieConnector.getRecipe(mealie, slug)); }
      catch (e) { this.log.warn(`recipe ${slug}: ${(e as Error).message}`); return null; }
    });
    return done.map(({ meal, lines }) => (lines ? { ...meal, recipeIngredients: lines.map((l) => l.text), ingredients: meal.extrasOnly ? meal.ingredients ?? [] : [] } : meal));
  }

  async add(householdId: string, text: string, aisle?: string, area?: Area, extras: Record<string, string> = {}) {
    await this.insert(householdId, text, aisle, area, extras);
    return this.list(householdId);
  }

  /** One item in the list; its id. */
  async insert(householdId: string, text: string, aisle?: string, area?: Area, extras: Record<string, string> = {}): Promise<string | null> {
    const { h } = await this.ctx(householdId);
    const name = await this.aisleFor(householdId, aisle || OTHER_AISLE[h.locale] || OTHER_AISLE.en);
    const e = split(extras);
    const last = await this.prisma.shoppingItem.aggregate({ where: { householdId }, _max: { position: true } });
    const x = await this.prisma.shoppingItem.create({ data: { householdId, text: text.trim().slice(0, 300), aisle: name, area: area ?? e.area ?? null,
      origin: e.origin ?? "manual", extras: e.rest, position: (last._max.position ?? 0) + 1 } });
    return x.id;
  }

  private async item(householdId: string, itemId: string) {
    const x = await this.prisma.shoppingItem.findFirst({ where: { id: itemId, householdId } });
    if (!x) throw new AppError(404, "shopping.notFound");
    return x;
  }

  /** Changes an item: text, aisle (added if new), list (in store / online), checked. */
  async update(householdId: string, itemId: string, b: { text?: string; aisle?: string; area?: Area; checked?: boolean }): Promise<ItemView> {
    const { h } = await this.ctx(householdId);
    await this.item(householdId, itemId);
    const data: Prisma.ShoppingItemUpdateInput = {};
    if (b.text !== undefined && b.text.trim()) data.text = b.text.trim().slice(0, 300);
    if (b.aisle !== undefined) data.aisle = await this.aisleFor(householdId, b.aisle.trim() || OTHER_AISLE[h.locale] || OTHER_AISLE.en);
    if (b.area) data.area = b.area;
    if (b.checked !== undefined) data.checked = b.checked;
    return viewOf(await this.prisma.shoppingItem.update({ where: { id: itemId }, data }));
  }

  async check(householdId: string, itemId: string, checked: boolean): Promise<ItemView> {
    return this.update(householdId, itemId, { checked });
  }

  /** « We already have it »: the item leaves the list. */
  async remove(householdId: string, itemId: string) {
    await this.ready(householdId);
    await this.prisma.shoppingItem.deleteMany({ where: { id: itemId, householdId } });
    return { ok: true };
  }

  async clearChecked(householdId: string) {
    await this.ready(householdId);
    const r = await this.prisma.shoppingItem.deleteMany({ where: { householdId, checked: true } });
    return { removed: r.count };
  }
}
