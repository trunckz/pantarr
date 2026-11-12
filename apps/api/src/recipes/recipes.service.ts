// Recipe import by URL into Mealie. Jow: the app's share link (app.jow.com/…recipeId=<id>) leads to a page without
// the recipe → replaced by https://jow.fr/recipes/<id> ; Jow gives quantities for 1 person → multiplied once for the
// household's servings (mark in extras). A recipe already in Mealie (same address, or same name after import) is
// not imported twice.
import { Injectable } from "@nestjs/common";
import { config } from "../config";
import { assertPublicAddress } from "../hosted/safe-fetch";
import { ConnectorsService } from "../connectors/connectors.service";
import { mealieConnector } from "../connectors/mealie/mealie.connector";
import { key } from "../common/text";
import { presented } from "./recipe-view";

/** Address to give to Mealie's importer. */
export function recipeAddress(url: string): string {
  const m = url.match(/recipeId=([0-9a-f]{24})/i);
  if (m) return `https://jow.fr/recipes/${m[1]}`;
  return /jow\.fr\//.test(url) ? url.split("?")[0] : url;
}

const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
/** « 60 g Riz » ×4 → « 240 g Riz » ; « 1/2 gousse » → « 2 gousse » ; text without a leading number unchanged. */
export function scaleNote(note: string, factor: number, locale = "fr"): string {
  const m = note.match(/^\s*(\d+\/\d+|\d+(?:[.,]\d+)?|[½¼¾⅓⅔])/);
  if (!m) return note;
  const v = m[1];
  const q = FRACTIONS[v] ?? (v.includes("/") ? +v.split("/")[0] / +v.split("/")[1] : parseFloat(v.replace(",", ".")));
  const r = Math.round(q * factor * 100) / 100;
  return (locale === "fr" ? String(r).replace(".", ",") : String(r)) + note.slice(m[0].length);
}

const sameAddress = (a?: string | null, b?: string) => !!a && !!b && a.split("?")[0].replace(/\/$/, "") === b.split("?")[0].replace(/\/$/, "");

@Injectable()
export class RecipesService {
  constructor(private connectors: ConnectorsService) {}

  /** Is the recipe of this address already in the household's recipes? (the extension says so on the recipe's page) */
  async known(householdId: string, url: string) {
    const mealie = await this.connectors.require(householdId, "mealie");
    const address = recipeAddress(url.trim());
    const all = presented(householdId, mealie, await mealieConnector.listRecipes(mealie)) as unknown as { name: string; url: string; orgURL?: string }[];
    const r = all.find((x) => sameAddress(x.orgURL, address));
    return r ? { known: true, name: r.name, url: r.url } : { known: false };
  }

  async import(householdId: string, url: string, servings: number, locale: string) {
    const mealie = await this.connectors.require(householdId, "mealie", locale);
    const address = recipeAddress(url.trim());
    if (config.mode === "hosted") await assertPublicAddress(address);   // Mealie downloads it from inside the platform
    const all = presented(householdId, mealie, await mealieConnector.listRecipes(mealie)) as unknown as { id: string; slug: string; name: string; url: string; orgURL?: string }[];
    const known = all.find((r) => sameAddress(r.orgURL, address));
    if (known) return { name: known.name, url: known.url, duplicate: true };
    const slug = await mealieConnector.importUrl(mealie, address);
    let r = await mealieConnector.getRecipe(mealie, slug);
    // Same recipe under another address (Mealie appends « (1) » to the name): the new copy is removed
    const twin = all.find((x) => key(x.name) === key(r.name.replace(/ \(\d+\)$/, "")));
    if (twin) { await mealieConnector.deleteRecipe(mealie, slug); return { name: twin.name, url: twin.url, duplicate: true }; }
    if (/jow\.fr\//.test(address) && !r.extras?.pantarr_servings) {
      const factor = servings / (r.recipeServings || 1);
      const ingredients = (r.recipeIngredient ?? []).map((i) => { const note = scaleNote(i.note ?? i.display ?? "", factor, locale); return { ...i, note, display: note }; });
      r = await mealieConnector.patchRecipe(mealie, slug, { recipeIngredient: ingredients, recipeServings: servings,
        recipeYield: locale === "fr" ? `${servings} personnes` : `${servings} servings`, extras: { ...(r.extras ?? {}), pantarr_servings: String(servings) } });
    }
    const link = presented(householdId, mealie, await mealieConnector.listRecipes(mealie)).find((x) => x.id === r.id)?.url ?? "";
    return { name: r.name, url: link, duplicate: false, ingredients: r.recipeIngredient?.length ?? 0, steps: r.recipeInstructions?.length ?? 0 };
  }
}
