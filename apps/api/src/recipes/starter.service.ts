// Starter recipes: 50 everyday dishes of 30 minutes at most, written for Pantarr (original texts, no rights of a
// recipe site), each with a photo under a free licence (Wikimedia Commons, author and licence in its notes). Given to
// every new household of a hosted instance, and to any household that asks (Recipes page). A recipe already there
// (same name) is not added twice.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import type { ConnectorContext } from "@pantarr/connector-sdk";
import { key } from "../common/text";
import { ConnectorsService } from "../connectors/connectors.service";
import { mealieConnector, type MealieOrganizer, type OrganizerKind } from "../connectors/mealie/mealie.connector";
import { JobsService } from "../jobs/jobs.service";
import { recipePatch, type Raw } from "./recipe-view";

export interface StarterRecipe {
  id: string; name: string; description: string; servings: number; prepMinutes: number; cookMinutes: number; tags: string[]; categories: string[];
  ingredients: { section?: string; text: string }[]; steps: string[];
  image: { file: string; author: string; license: string; licenseUrl: string; source: string };
}

const DIR = join(__dirname, "starter");
let cache: StarterRecipe[] | null = null;
/** The starter recipes (French for now: the first households are French). */
export function starterRecipes(): StarterRecipe[] {
  cache ??= (JSON.parse(readFileSync(join(DIR, "recipes.fr.json"), "utf8")) as { recipes: StarterRecipe[] }).recipes;
  return cache;
}

/** Credit line of the photo (licence terms: author, licence, source). */
export const photoCredit = (r: StarterRecipe) => `${r.image.author} — ${r.image.license}${r.image.licenseUrl ? ` (${r.image.licenseUrl})` : ""} — ${r.image.source}`;

@Injectable()
export class StarterService {
  private log = new Logger("starter");
  constructor(private connectors: ConnectorsService, private jobs: JobsService) {}

  /** In the background: the job tells when it is done. */
  start(householdId: string) {
    return this.jobs.start("starter", `starter:${householdId}`, householdId, {}, () => this.seed(householdId));
  }

  /** Adds the starter recipes missing in the household's Mealie. */
  async seed(householdId: string): Promise<{ added: number; skipped: number }> {
    const ctx = await this.connectors.require(householdId, "mealie", "fr");
    const known = new Set((await mealieConnector.listRecipes(ctx)).map((r) => key(r.name)));
    const organizers: Record<OrganizerKind, MealieOrganizer[]> = { tags: await mealieConnector.organizers(ctx, "tags"), categories: await mealieConnector.organizers(ctx, "categories") };
    let added = 0, skipped = 0;
    for (const s of starterRecipes()) {
      if (known.has(key(s.name))) { skipped++; continue; }
      try { await this.add(ctx, s, organizers); added++; }
      catch (e) { this.log.warn(`${householdId} ${s.id}: ${(e as Error).message}`); }
    }
    this.log.log(`${householdId}: ${added} starter recipes added, ${skipped} already there`);
    return { added, skipped };
  }

  private async organizer(ctx: ConnectorContext, all: Record<OrganizerKind, MealieOrganizer[]>, kind: OrganizerKind, names: string[]) {
    for (const n of names) if (!all[kind].some((o) => o.name.toLowerCase() === n.toLowerCase())) all[kind].push(await mealieConnector.createOrganizer(ctx, kind, n));
  }

  private async add(ctx: ConnectorContext, s: StarterRecipe, organizers: Record<OrganizerKind, MealieOrganizer[]>) {
    await this.organizer(ctx, organizers, "tags", s.tags);
    await this.organizer(ctx, organizers, "categories", s.categories);
    const slug = await mealieConnector.createRecipe(ctx, s.name);
    const raw = (await mealieConnector.getRecipe(ctx, slug)) as unknown as Raw;
    const body = recipePatch(raw, {
      name: s.name, description: s.description, source: null, servings: s.servings, prepMinutes: s.prepMinutes, cookMinutes: s.cookMinutes, totalMinutes: null,
      ingredients: s.ingredients, steps: s.steps.map((text) => ({ text })), notes: [{ title: "Photo", text: photoCredit(s) }], tags: s.tags, categories: s.categories,
    }, organizers, "fr");
    const saved = await mealieConnector.patchRecipe(ctx, slug, { ...body, extras: { pantarr_starter: s.id } } as never);
    await mealieConnector.setImage(ctx, saved.slug ?? slug, readFileSync(join(DIR, s.image.file)), "jpg").catch((e) => this.log.warn(`${s.id} photo: ${(e as Error).message}`));
  }
}
