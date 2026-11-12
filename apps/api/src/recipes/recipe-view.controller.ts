// Recipes managed by Pantarr (Mealie stays behind, with the household's own token): page, edition, new recipe,
// picture, removal, favourite and rating, tags and categories.
import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import type { Response } from "express";
import type { ConnectorContext } from "@pantarr/connector-sdk";
import { AuthUser, CurrentUser } from "../auth/decorators";
import { householdAccess } from "../common/access";
import { ConnectorsService } from "../connectors/connectors.service";
import { mealieConnector, type OrganizerKind } from "../connectors/mealie/mealie.connector";
import { AppError } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";
import { mealieIsPrivate, recipePatch, recipeView, type Raw } from "./recipe-view";
import { StarterService, starterRecipes } from "./starter.service";

class IngredientDto { @IsOptional() @IsString() @MaxLength(120) section?: string; @IsString() @MaxLength(500) text: string }
class StepDto { @IsOptional() @IsString() @MaxLength(200) title?: string; @IsString() @MaxLength(5000) text: string }
class RecipeDto {
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(1000) source?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) servings?: number | null;
  @IsOptional() @IsString() @MaxLength(100) yield?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) prepMinutes?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(10000) cookMinutes?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(10000) totalMinutes?: number | null;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => IngredientDto) ingredients: IngredientDto[];
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => StepDto) steps: StepDto[];
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => StepDto) notes: StepDto[];
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(60, { each: true }) tags: string[];
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(60, { each: true }) categories: string[];
}
class NewRecipeDto { @IsString() @MinLength(1) @MaxLength(200) name: string }
class RateDto { @IsOptional() @IsBoolean() favorite?: boolean; @IsOptional() @IsNumber() @Min(0) @Max(5) rating?: number | null }

const PICTURE = /^image\/(jpeg|png|webp)$/;
interface Upload { mimetype: string; buffer: Buffer; size: number }

@ApiTags("recipes")
@Controller("households/:id")
export class RecipeViewController {
  constructor(private prisma: PrismaService, private connectors: ConnectorsService, private starter: StarterService) {}

  private async mealie(me: AuthUser, id: string) {
    const h = await householdAccess(this.prisma, me, id);
    return { h, ctx: await this.connectors.require(id, "mealie", h.locale) };
  }

  private async raw(ctx: ConnectorContext, slug: string): Promise<Raw> {
    return (await mealieConnector.getRecipe(ctx, encodeURIComponent(slug)).catch(() => { throw new AppError(404, "recipes.notFound"); })) as unknown as Raw;
  }

  /** Tags and categories known to the household's Mealie (suggestions of the editor and filters of the list). */
  @Get("recipe-organizers")
  async organizers(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    const { ctx } = await this.mealie(me, id);
    const [tags, categories] = await Promise.all([mealieConnector.organizers(ctx, "tags"), mealieConnector.organizers(ctx, "categories")]);
    return { tags: tags.map((t) => t.name), categories: categories.map((c) => c.name) };
  }

  /** One recipe: picture, times, servings, ingredients, steps, notes, source, tags, favourite and rating. */
  @Get("recipes/:slug")
  async recipe(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("slug") slug: string) {
    const { ctx } = await this.mealie(me, id);
    const r = await this.raw(ctx, slug);
    const rating = (await mealieConnector.ratings(ctx).catch(() => [])).find((x) => x.recipeId === r.id);
    const mealieUrl = mealieIsPrivate(ctx) ? null : await mealieConnector.listRecipes(ctx).then((l) => l.find((x) => x.id === r.id)?.url ?? null).catch(() => null);
    return { ...recipeView(id, r), favorite: !!rating?.isFavorite, rating: rating?.rating ?? null, mealieUrl };
  }

  /** The starter recipes (50 everyday dishes with a photo) added in the background ; those already there are kept. */
  @Post("recipes/starter")
  async addStarter(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    await this.mealie(me, id);
    return { ...(await this.starter.start(id)), count: starterRecipes().length };
  }

  /** New recipe (name only, then edited). */
  @Post("recipes")
  async create(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: NewRecipeDto) {
    const { ctx } = await this.mealie(me, id);
    return { slug: await mealieConnector.createRecipe(ctx, b.name.trim()) };
  }

  /** Saves the editor's recipe; the new tags and categories are created. Gives the slug (it follows the name). */
  @Put("recipes/:slug")
  async save(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("slug") slug: string, @Body() b: RecipeDto) {
    const { h, ctx } = await this.mealie(me, id);
    const r = await this.raw(ctx, slug);
    const known = async (kind: OrganizerKind, names: string[]) => {
      const all = await mealieConnector.organizers(ctx, kind);
      for (const n of [...new Set(names.map((x) => x.trim()).filter(Boolean))]) {
        if (!all.some((o) => o.name.toLowerCase() === n.toLowerCase())) all.push(await mealieConnector.createOrganizer(ctx, kind, n));
      }
      return all;
    };
    const [tags, categories] = await Promise.all([known("tags", b.tags), known("categories", b.categories)]);
    const saved = await mealieConnector.patchRecipe(ctx, encodeURIComponent(slug), recipePatch(r, b, { tags, categories }, h.locale) as never);
    return { slug: saved.slug };
  }

  @Delete("recipes/:slug")
  async remove(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("slug") slug: string) {
    const { ctx } = await this.mealie(me, id);
    await this.raw(ctx, slug);
    await mealieConnector.deleteRecipe(ctx, encodeURIComponent(slug));
    return { ok: true };
  }

  /** Favourite of the household and rating (1 to 5, 0 = none). */
  @Put("recipes/:slug/rating")
  async rate(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("slug") slug: string, @Body() b: RateDto) {
    const { ctx } = await this.mealie(me, id);
    await this.raw(ctx, slug);
    await mealieConnector.rate(ctx, encodeURIComponent(slug), { ...(b.favorite !== undefined ? { isFavorite: b.favorite } : {}), ...(b.rating !== undefined ? { rating: b.rating || null } : {}) });
    return { ok: true };
  }

  /** New picture (jpeg, png, webp, field « image », 10 MB). */
  @Put("recipes/:slug/image")
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: 10 * 1024 * 1024 } }))
  async picture(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("slug") slug: string, @UploadedFile() f: Upload) {
    const { ctx } = await this.mealie(me, id);
    if (!f || !PICTURE.test(f.mimetype)) throw new AppError(400, "recipes.badImage");
    await this.raw(ctx, slug);
    await mealieConnector.setImage(ctx, encodeURIComponent(slug), f.buffer, f.mimetype.split("/")[1].replace("jpeg", "jpg"));
    return { ok: true };
  }

  /** Picture of a recipe (« min »: the thumbnail of the lists, « full »: the recipe page). */
  @Get("recipes/:recipe/image")
  async image(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("recipe") recipe: string, @Query("size") size: string, @Res() res: Response) {
    await householdAccess(this.prisma, me, id);
    if (!/^[0-9a-f-]{32,36}$/i.test(recipe)) throw new AppError(404, "recipes.notFound");
    const ctx = await this.connectors.require(id, "mealie");
    const base = String(ctx.settings.url ?? "").replace(/\/$/, "");
    const file = size === "full" ? "original.webp" : "min-original.webp";
    const r = await ctx.fetch(`${base}/api/media/recipes/${recipe}/images/${file}`, { headers: { Authorization: `Bearer ${ctx.settings.token}` }, signal: AbortSignal.timeout(15000) })
      .catch(() => null);
    if (!r?.ok) { res.status(404).end(); return; }
    res.setHeader("Content-Type", r.headers.get("content-type") ?? "image/webp");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(Buffer.from(await r.arrayBuffer()));
  }
}
