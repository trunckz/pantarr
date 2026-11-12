// Meal planning: builds the prompt from the household (people, presence, habits, recipes, purchase rules), calls the
// enabled LLM connector within the monthly quota, keeps one draft per period, changes one meal, validates into Mealie.
import { aislesFor } from "../shopping/shopping.service";
import { BudgetService } from "../pantry/budget.service";
import { balanceOf, nutritionRule } from "./nutrition";
import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import type { ConnectorContext, RecipeSummary } from "@pantarr/connector-sdk";
import { Prisma } from "@prisma/client";
import { config } from "../config";
import { busyMeals, busyNote } from "./calendar-privacy";
import { ConnectorsService, IMPLEMENTED } from "../connectors/connectors.service";
import { mealieConnector } from "../connectors/mealie/mealie.connector";
import { ALLERGENS, allergensIn, DIETS, label } from "../households/catalogue";
import { settingsOf } from "../households/households.defaults";
import { AppError } from "../i18n/i18n";
import { JobsService } from "../jobs/jobs.service";
import { key } from "../common/text";
import { PantryService } from "../pantry/pantry.service";
import { PrismaService } from "../prisma/prisma.service";
import { backwardMeals, dropBackward, leftoverLinks, slotOf, slotText } from "./leftovers";
import { detailOf, withRecipeLines } from "./recipe-quantities";
import { presented } from "../recipes/recipe-view";
import { LlmService } from "./llm.service";
import { age, daysList, DEFAULT_TEMPLATES, render, season } from "./templates";
import type { Answer, Meal } from "./types";
export type { Answer, Meal } from "./types";


export const MARK = "[pantarr]";
type Recipe = RecipeSummary;
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const CALENDAR_MODULES = ["ics", "caldav", "home-assistant", "google-calendar", "microsoft-calendar"];

@Injectable()
export class PlanningService {
  private log = new Logger("planning");
  constructor(private prisma: PrismaService, private connectors: ConnectorsService, private jobs: JobsService, private ai: LlmService,
              @Inject(forwardRef(() => PantryService)) private pantry: PantryService, private budget: BudgetService) {}

  // ── Quota ──
  usage(householdId: string) { return this.ai.usage(householdId); }

  private llm(householdId: string, locale: string, purpose: string, prompt: string) { return this.ai.complete(householdId, locale, purpose, prompt); }

  // ── Context of the prompt ──
  async prompt(householdId: string, start: string, days: number, notes = ""): Promise<{ prompt: string; mealie: ConnectorContext; recipes: Recipe[] }> {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId }, include: { members: { orderBy: { position: "asc" } }, purchaseRules: { orderBy: { position: "asc" } } } });
    const s = settingsOf(h), loc = h.locale, fr = loc === "fr";
    const mealie = await this.connectors.require(householdId, "mealie", loc);
    const end = addDays(start, days - 1);
    const recipes = await mealieConnector.listRecipes(mealie);
    const recent = await mealieConnector.mealPlanEntries(mealie, addDays(start, -14), addDays(start, -1));
    const learned = await this.learned(householdId);
    const habitual = [...s.habitualDishes, ...learned.dishes.filter((d) => !s.habitualDishes.some((x) => key(x) === key(d)))];
    const habitualKeys = new Set(habitual.map(key));
    const times = new Map(recipes.filter((r) => r.minutes).map((r) => [key(r.name), r.minutes!]));
    const withTime = (name: string) => (times.has(key(name)) ? `${name} (${times.get(key(name))} min)` : name);
    // the household's aisles (kept by Pantarr ; a household not moved yet: its Mealie labels), the usual ones while it has few
    const own = (await this.prisma.aisle.findMany({ where: { householdId }, orderBy: [{ position: "asc" }, { name: "asc" }] })).map((a) => a.name);
    const aisles = aislesFor(own.length ? own : (await mealieConnector.labels(mealie)).map((l) => l.name), loc);
    // Calendars are optional: one that fails (token expired…) is reported to the planner, the planning goes on
    const events = [], unavailable: string[] = [], busy: string[] = [];
    for (const m of CALENDAR_MODULES) {
      const ctx = await this.connectors.context(householdId, m, loc);
      if (!ctx) continue;
      try {
        const got = await (IMPLEMENTED as unknown as Record<string, { events: (c: ConnectorContext, f: string, t: string) => Promise<{ start: string; end: string; allDay: boolean; title: string; calendar: string }[]> }>)[m]
          .events({ ...ctx, settings: { timezone: s.timezone, ...ctx.settings } }, start, addDays(start, days));
        // Google Calendar through the instance's own Google app: Google's « Limited Use » rules — only busy slots go to
        // the LLM, never the titles nor the calendar names (the planner only needs who is away when)
        if (m === "google-calendar" && !ctx.settings.clientId) busy.push(...busyMeals(got, fr));
        else events.push(...got);
      } catch (e) {
        ctx.log(`calendar unavailable: ${(e as Error).message}`);
        unavailable.push(m);
      }
    }
    const none = fr ? "(aucun)" : "(none)";
    const values: Record<string, string> = {
      period_start: start, period_end: end, days: daysList(start, days, loc), season: season(start, loc),
      members: h.members.map((m) => `- ${m.name} (${m.kind === "child" ? (fr ? "enfant" : "child") : (fr ? "adulte" : "adult")}${m.birthDate ? ", " + age(m.birthDate, start, loc) : ""})`
        + (m.allergies.length ? ` — ${fr ? "ALLERGIES (interdit absolu)" : "ALLERGIES (strictly forbidden)"} : ${m.allergies.map((a) => label(ALLERGENS, a, loc)).join(", ")}` : "")
        + (m.diets.length ? ` — ${fr ? "régime" : "diet"} : ${m.diets.map((d) => label(DIETS, d, loc)).join(", ")}` : "")
        + ` : ${m.rules || none}`).join("\n") || none,
      presence_rules: s.presenceRules || none,
      calendar: [...events.map((e) => `- ${e.allDay ? e.start : e.start.replace("T", " ")} → ${e.allDay ? e.end : e.end.slice(11)} : ${e.title} (${e.calendar})`),
        ...(busy.length ? [...busy, busyNote(fr)] : []),
        ...unavailable.map((m) => fr ? `(agenda « ${m} » indisponible : suivre les habitudes de présence)` : `(calendar "${m}" unavailable: follow the usual presence)`)].join("\n") || none,
      habitual_dishes: habitual.map(withTime).join(", ") || none,
      other_recipes: recipes.filter((r) => !habitualKeys.has(key(r.name))).map((r) => withTime(r.name)).join(", ") || none,
      recent_meals: recent.map((x) => `${x.date} ${x.entryType} : ${x.recipe?.name ?? x.title ?? ""}`).join("; ") || none,
      less_liked: learned.lessLiked.join(", ") || none,
      preferences: s.preferences || none,
      purchase_rules: h.purchaseRules.map((r) => `- ${r.text}`).join("\n") || none,
      fresh_products: (await this.pantry.freshProducts(householdId, loc)).join("; ") || none,
      aisles: aisles.join(", ") || none,
    };
    const wishes = notes ? (fr ? `\n\n## Consignes particulières pour cette période (prioritaires sur les habitudes, jamais sur les allergies)\n${notes}`
      : `\n\n## Special instructions for this period (they win over the habits, never over the allergies)\n${notes}`) : "";
    // always said, whatever the prompt of the household: the planned days follow each other in this order
    const order = fr
      ? `\n\nOrdre des jours : ${daysList(start, days, loc)}. Des restes (« leftovers_from ») viennent toujours d'un repas qui a lieu AVANT dans cette liste, jamais d'un repas qui vient après ; une préparation à l'avance (« batch ») d'un jour ne sert qu'aux repas qui suivent ce jour.`
      : `\n\nOrder of the days: ${daysList(start, days, loc)}. Leftovers ("leftovers_from") always come from a meal that takes place BEFORE in this list, never from a later one; a batch cooked one day only serves the meals after that day.`;
    // balance and budget: said whatever the prompt of the household (the guidelines can be turned off in the settings)
    const guide = (s.nutritionGuide === false ? "" : nutritionRule(fr)) + await this.budget.rule(householdId, fr);
    return { prompt: render((config.mode === "hosted" ? "" : s.promptTemplate) || DEFAULT_TEMPLATES[loc] || DEFAULT_TEMPLATES.en, values) + guide + wishes + order, mealie, recipes };
  }

  /** Validated at least twice in 4 months → habitual ; replaced twice in 3 months and not validated since → less liked. */
  async learned(householdId: string) {
    const since = new Date(Date.now() - 120 * 864e5);
    const rows = await this.prisma.mealFeedback.findMany({ where: { householdId, at: { gte: since } } });
    const by = new Map<string, { dish: string; validated: Date[]; replaced: Date[] }>();
    for (const r of rows) {
      const x = by.get(key(r.dish)) ?? { dish: r.dish, validated: [], replaced: [] };
      (r.kind === "validated" ? x.validated : x.replaced).push(r.at);
      by.set(key(r.dish), x);
    }
    const lim90 = Date.now() - 90 * 864e5;
    const dishes = [...by.values()].filter((x) => x.validated.length >= 2).map((x) => x.dish);
    const lessLiked = [...by.values()].filter((x) => {
      const rep = x.replaced.filter((d) => d.getTime() >= lim90);
      return rep.length >= 2 && Math.max(0, ...x.validated.map((d) => d.getTime())) < Math.max(...rep.map((d) => d.getTime()));
    }).map((x) => x.dish);
    return { dishes, lessLiked };
  }

  /** Mealie recipe of each meal: link, real time (instead of the model's guess), slug for its ingredients. */
  private link(answer: Answer, recipes: Recipe[]): Answer {
    const byName = new Map(recipes.map((r) => [key(r.name), r]));
    for (const m of answer.meals ?? []) {
      const r = byName.get(key(m.recipe ?? "")) ?? byName.get(key(m.dish ?? ""));
      m.recipeId = r?.id ?? null; m.recipeUrl = r?.url ?? null; m.recipeSlug = r?.slug ?? null;
      if (r?.minutes) { m.minutes = r.minutes; m.minutesSource = "recipe"; }
      else { m.minutes = typeof m.minutes === "number" ? m.minutes : parseInt(String(m.minutes ?? ""), 10) || undefined; m.minutesSource = "estimate"; }
    }
    return answer;
  }

  /** Ingredients of the Mealie recipes, scaled to the people of each meal (and to those eating its leftovers): kept
   * on the meal for the allergy check ; the model's « ingredients » are then only the additions. */
  async withRecipes(householdId: string, mealie: ConnectorContext, meals: Meal[]): Promise<void> {
    const members = await this.prisma.member.findMany({ where: { householdId } });
    const done = await withRecipeLines(meals, members, (m) => m.recipeSlug, async (slug) => detailOf(await mealieConnector.getRecipe(mealie, slug)));
    for (const { meal, lines } of done) if (lines) { meal.recipeIngredients = lines.map((l) => l.text); meal.extrasOnly = true; }
  }

  /** Allergy check of the ingredients, for the people of each meal (everyone when « for » is empty). */
  private async allergyCheck(householdId: string, answer: Answer, locale: string): Promise<Answer> {
    const members = await this.prisma.member.findMany({ where: { householdId } });
    for (const m of answer.meals) {
      const eaters = members.filter((x) => !m.for?.length || m.for.some((f) => key(f) === key(x.name)));
      const names = [...(m.ingredients ?? []).map((i) => i.name ?? ""), ...(m.recipeIngredients ?? [])];
      const found = eaters.flatMap((x) => names.flatMap((n) =>
        allergensIn(n, x.allergies).map((a) => ({ member: x.name, allergen: label(ALLERGENS, a, locale), ingredient: n }))));
      m.warnings = found.filter((w, i) => found.findIndex((x) => x.member === w.member && x.allergen === w.allergen) === i);   // once per person and allergen
    }
    return answer;
  }

  private check(json: unknown): Answer {
    const a = json as Answer;
    if (!a || !Array.isArray(a.meals)) throw new Error("the model answered without a « meals » list");
    return a;
  }

  // ── Actions (background jobs) ──
  propose(householdId: string, start: string, days: number, notes = "") {
    return this.jobs.start("propose", `propose:${householdId}:${start}`, householdId, { start, days, notes }, async () => {
      const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
      const { prompt, recipes, mealie } = await this.prompt(householdId, start, days, notes);
      const linked = this.link(this.check(await this.llm(householdId, h.locale, "propose", prompt)), recipes);
      // leftovers taken from a later meal (a weekend batch for the Monday before…): those meals asked again once
      const bad = backwardMeals(linked.meals);
      if (bad.length) {
        const fr = h.locale === "fr";
        const wish = fr ? "Ces repas mangeaient les restes ou la préparation d'un repas qui a lieu APRÈS eux, c'est impossible : propose-les autrement (un plat à part entière, ou les restes d'un repas qui a lieu avant)."
          : "These meals ate the leftovers or the batch of a meal taking place AFTER them, which is impossible: plan them otherwise (a dish of their own, or the leftovers of an earlier meal).";
        try {
          const fixed = this.link(this.check(await this.llm(householdId, h.locale, "change", prompt + changeRequest(linked.meals, bad, bad[0], wish, h.locale))), recipes);
          if (fixed.meals.length) mergeChange(linked.meals, bad, fixed.meals);
        } catch (e) { this.log.warn(`${householdId}: leftovers order not repaired: ${(e as Error).message}`); }
        if (dropBackward(linked.meals)) this.log.warn(`${householdId}: impossible leftovers links dropped`);
      }
      await this.withRecipes(householdId, mealie, linked.meals);
      const answer = await this.allergyCheck(householdId, linked, h.locale);
      answer.notes = notes || undefined;   // shown again when the period is regenerated
      await this.prisma.mealPlanDraft.upsert({ where: { householdId_start: { householdId, start: new Date(start) } },
        create: { householdId, start: new Date(start), days, answer: answer as unknown as Prisma.InputJsonValue },
        update: { days, answer: answer as unknown as Prisma.InputJsonValue, validatedAt: null } });
      return { meals: answer.meals.length };
    });
  }

  /** Replaces the meal « index » (and the meals of « also », those linked by leftovers) ; the model sees the whole menu
   * so that the leftovers of the meals kept stay consistent. */
  async change(householdId: string, start: string, index: number, wish: string, also: number[] = []) {
    const draft = await this.prisma.mealPlanDraft.findUnique({ where: { householdId_start: { householdId, start: new Date(start) } } });
    const answer = draft?.answer as unknown as Answer | undefined;
    const meal = answer?.meals?.[index];
    if (!draft || !meal) throw new AppError(404, "planning.noDraft");
    const replaced = [index, ...also.filter((i) => i !== index && answer!.meals[i])].sort((x, y) => x - y);
    return this.jobs.start("change", `change:${householdId}:${start}`, householdId, { start, index, also }, async () => {
      const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
      const { prompt, recipes, mealie } = await this.prompt(householdId, start, draft.days, answer!.notes ?? "");
      const one = this.link(this.check(await this.llm(householdId, h.locale, "change",
        prompt + changeRequest(answer!.meals, replaced, index, wish, h.locale))), recipes);
      if (!one.meals.length) throw new Error("no meal proposed");
      await this.prisma.mealFeedback.create({ data: { householdId, dish: meal.dish, kind: "replaced" } });
      const fresh = await this.prisma.mealPlanDraft.findUniqueOrThrow({ where: { id: draft.id } });
      const a = fresh.answer as unknown as Answer;
      mergeChange(a.meals, replaced, one.meals);
      await this.withRecipes(householdId, mealie, a.meals);   // leftovers may have moved: every meal scaled again
      await this.allergyCheck(householdId, a, h.locale);
      await this.prisma.mealPlanDraft.update({ where: { id: draft.id }, data: { answer: a as unknown as Prisma.InputJsonValue } });
      return { dishes: replaced.map((i) => a.meals[i].dish) };
    });
  }

  /** Writes the draft into the Mealie meal plan (Pantarr entries of the period replaced). */
  async validate(householdId: string, start: string) {
    const draft = await this.prisma.mealPlanDraft.findUnique({ where: { householdId_start: { householdId, start: new Date(start) } } });
    if (!draft) throw new AppError(404, "planning.noDraft");
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    const mealie = await this.connectors.require(householdId, "mealie", h.locale);
    const a = draft.answer as unknown as Answer, end = addDays(start, draft.days - 1);
    for (const x of await mealieConnector.mealPlanEntries(mealie, start, end)) if ((x.text ?? "").includes(MARK)) await mealieConnector.deleteMealPlan(mealie, x.id);
    const fr = h.locale === "fr";
    await mealieConnector.writeMealPlan(mealie, a.meals.map((m) => ({
      date: m.date, meal: m.meal, recipeId: m.recipeId ?? undefined, title: m.recipeId ? "" : m.dish,
      note: [`${fr ? "Pour" : "For"} : ${(m.for ?? []).join(", ")}`, ...(m.adjustments ?? []).map((x) => `${x.member} : ${x.text}`),
        ...(m.leftovers_for ? [`${fr ? "Restes pour" : "Leftovers for"} ${m.leftovers_for}`] : [])].join(" · ") + ` ${MARK}`,
    })));
    await this.prisma.mealFeedback.createMany({ data: a.meals.map((m) => ({ householdId, dish: m.dish, kind: "validated" })) });
    await this.prisma.mealPlanDraft.update({ where: { id: draft.id }, data: { validatedAt: new Date() } });
    return { meals: a.meals.length };
  }

  async period(householdId: string, start: string, days: number) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    const draft = await this.prisma.mealPlanDraft.findUnique({ where: { householdId_start: { householdId, start: new Date(start) } } });
    const ctx = await this.connectors.context(householdId, "mealie", h.locale);
    const plan = ctx ? await mealieConnector.mealPlanEntries(ctx, start, addDays(start, days - 1)) : [];
    const draftMeals = ((draft?.answer as unknown as Answer | undefined)?.meals ?? []);
    // links as the household can open them (the Pantarr recipe page when Mealie is not public)
    const recipes = ctx && (plan.some((x) => x.recipeId) || draftMeals.some((m) => m.recipeId)) ? presented(householdId, ctx, await mealieConnector.listRecipes(ctx)) : [];
    const urls = new Map(recipes.map((r) => [r.id, r.url]));
    const byId = new Map(recipes.map((r) => [r.id, r]));
    for (const m of draftMeals) {   // the time of the recipe as it is now in Mealie (drafts made before it was read)
      const r = m.recipeId ? byId.get(m.recipeId) : undefined;
      if (r?.minutes) { m.minutes = r.minutes; m.minutesSource = "recipe"; }
      else if (!m.minutesSource) m.minutesSource = "estimate";
      if (r) m.recipeUrl = r.url;
    }
    const job = await this.jobs.running(`propose:${householdId}:${start}`) ?? await this.jobs.running(`change:${householdId}:${start}`)
      ?? await this.jobs.running(`shopping:${householdId}:${start}`);
    const failed = await this.jobs.lastFailed(householdId, "propose", new Date(Date.now() - 3600e3));
    return {
      draft: draft ? withLinks({ start, days: draft.days, validatedAt: draft.validatedAt, ...(draft.answer as object), meals: draftMeals } as { meals?: Meal[] }) : null,
      // what the menu is made of, against the guidelines (computed from the ingredients, no LLM)
      balance: draft && draftMeals.length ? balanceOf(draftMeals, draft.days) : null,
      plan: plan.filter((x) => ["lunch", "dinner"].includes(x.entryType)).map((x) => ({ date: x.date, meal: x.entryType, dish: x.recipe?.name ?? x.title ?? "",
        note: (x.text ?? "").replace(MARK, "").trim(), recipeUrl: x.recipeId ? urls.get(x.recipeId) ?? null : null })),
      job: job ? { id: job.id, kind: job.kind, since: job.createdAt } : null,
      lastError: failed && (!draft || failed.createdAt > draft.updatedAt) ? failed.error : null,
      usage: await this.usage(householdId),
    };
  }
}

/** Each meal with the indexes of the meals linked to it by leftovers (« feeds »: they eat its leftovers). */
function withLinks<T extends { meals?: Meal[] }>(d: T): T {
  const links = leftoverLinks(d.meals ?? []);
  return { ...d, meals: (d.meals ?? []).map((m, i) => ({ ...m, links: links[i] })) };
}

/** The request added to the prompt to replace some meals of the menu. */
export function changeRequest(meals: Meal[], replaced: number[], index: number, wish: string, locale: string): string {
  const fr = locale === "fr";
  const links = leftoverLinks(meals);
  const out = (i: number) => !replaced.includes(i);
  const line = (m: Meal, i: number) => `[${i + 1}] ${slotText(m)} — ${(m.for ?? []).join(", ")} — « ${m.dish} »`
    + (m.leftovers_for ? (fr ? ` — fait des restes pour ${m.leftovers_for}` : ` — makes leftovers for ${m.leftovers_for}`) : "")
    + (m.leftovers_from ? (fr ? ` — mangé avec les restes de ${m.leftovers_from}` : ` — eaten from the leftovers of ${m.leftovers_from}`) : "")
    + (replaced.includes(i) ? (fr ? "   ← À REMPLACER" : "   ← TO REPLACE") : "");
  const notes: string[] = [];
  for (const i of replaced) {
    for (const k of links[i].feeds.filter(out)) notes.push(fr
      ? `- [${i + 1}] fournissait les restes de [${k + 1}] (« ${meals[k].dish} »), qui est gardé : le nouveau plat doit pouvoir être mangé en restes à ce repas (même plat, quantités prévues), sinon mets « leftovers_for » à null.`
      : `- [${i + 1}] provided the leftovers of [${k + 1}] ("${meals[k].dish}"), which is kept: the new dish must be fit to be eaten as leftovers at that meal (same dish, quantities planned), otherwise set "leftovers_for" to null.`);
    for (const k of links[i].fedBy.filter(out)) notes.push(fr
      ? `- [${i + 1}] devait être mangé avec les restes de [${k + 1}] (« ${meals[k].dish} »), qui est gardé : de préférence, garde ce principe (« leftovers_from » = ${slotText(meals[k])}) ; sinon « leftovers_from » vaut null.`
      : `- [${i + 1}] was to be eaten from the leftovers of [${k + 1}] ("${meals[k].dish}"), which is kept: preferably keep that ("leftovers_from" = ${slotText(meals[k])}); otherwise "leftovers_from" is null.`);
  }
  const several = replaced.length > 1;
  return fr
    ? `\n\n## Demande particulière\nVoici le menu complet de la période. Remplace uniquement ${several ? "les repas marqués" : "le repas marqué"} « À REMPLACER » (${replaced.map((i) => `[${i + 1}]`).join(", ")}) par d'autres plats qui respectent les mêmes règles ; les autres repas sont gardés tels quels.${wish ? ` Souhait pour [${index + 1}] : ${wish}` : ""}\n${meals.map(line).join("\n")}\n`
      + (several ? "Les repas remplacés peuvent être liés entre eux par des restes (« leftovers_for » / « leftovers_from »).\n" : "")
      + (notes.length ? `Restes à respecter :\n${notes.join("\n")}\n` : "")
      + `Ne répète pas un plat déjà prévu. Réponds avec le même format JSON, « meals » contenant exactement ${replaced.length} repas, avec les mêmes « date » et « meal » que ${several ? "les repas remplacés" : "le repas remplacé"}.`
    : `\n\n## Special request\nHere is the whole menu of the period. Replace only the meal${several ? "s" : ""} marked "TO REPLACE" (${replaced.map((i) => `[${i + 1}]`).join(", ")}) with other dishes following the same rules; the other meals are kept as they are.${wish ? ` Wish for [${index + 1}]: ${wish}` : ""}\n${meals.map(line).join("\n")}\n`
      + (several ? "The replaced meals may be linked together by leftovers (\"leftovers_for\" / \"leftovers_from\").\n" : "")
      + (notes.length ? `Leftovers to respect:\n${notes.join("\n")}\n` : "")
      + `Do not repeat a dish already planned. Answer with the same JSON format, "meals" holding exactly ${replaced.length} meal${several ? "s" : ""}, with the same "date" and "meal" as the replaced one${several ? "s" : ""}.`;
}

/** Puts the new meals in the replaced places (matched by date and meal, else in order) and clears the leftovers of the
 * meals kept that no new meal takes over. */
export function mergeChange(meals: Meal[], replaced: number[], fresh: Meal[]) {
  const pool = [...fresh];
  for (const i of replaced) {
    const at = pool.findIndex((m) => m.date === meals[i].date && m.meal === meals[i].meal);
    const m = at >= 0 ? pool.splice(at, 1)[0] : pool.shift();
    if (m) meals[i] = { ...m, date: meals[i].date, meal: meals[i].meal };
  }
  const isReplaced = (s: ReturnType<typeof slotOf>) => !!s && replaced.some((i) => meals[i].date === s.date && meals[i].meal === s.meal);
  meals.forEach((k, i) => {
    if (replaced.includes(i)) return;
    // A kept meal cooked leftovers for a replaced one: still true only if the new meal says it eats them
    const to = slotOf(k.leftovers_for);
    if (isReplaced(to) && !replaced.some((r) => meals[r].date === to!.date && meals[r].meal === to!.meal
      && slotOf(meals[r].leftovers_from)?.date === k.date && slotOf(meals[r].leftovers_from)?.meal === k.meal)) k.leftovers_for = null;
    // A kept meal ate the leftovers of a replaced one: still true only if the new meal makes leftovers for it
    const from = slotOf(k.leftovers_from);
    if (isReplaced(from) && !replaced.some((r) => meals[r].date === from!.date && meals[r].meal === from!.meal
      && slotOf(meals[r].leftovers_for)?.date === k.date && slotOf(meals[r].leftovers_for)?.meal === k.meal)) k.leftovers_from = null;
  });
}
