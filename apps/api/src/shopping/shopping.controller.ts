import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from "class-validator";
import { AuthUser, CurrentUser, HouseholdAdmin } from "../auth/decorators";
import { settingsOf } from "../households/households.defaults";
import { householdAccess } from "../common/access";
import { PrismaService } from "../prisma/prisma.service";
import { PantryService } from "../pantry/pantry.service";
import { RecipesService } from "../recipes/recipes.service";
import { ListSyncService } from "../list-sync/list-sync.service";
import { Area, ShoppingService } from "./shopping.service";

class AddDto { @IsString() text: string; @IsOptional() @IsString() aisle?: string; @IsOptional() @IsIn(["in-store", "online"]) area?: Area }
class UpdateDto {
  @IsOptional() @IsBoolean() checked?: boolean; @IsOptional() @IsString() @MaxLength(200) text?: string;
  @IsOptional() @IsString() @MaxLength(80) aisle?: string; @IsOptional() @IsIn(["in-store", "online"]) area?: Area;
}
class StartDto { @IsISO8601() start: string }
class AisleDto { @IsString() @MinLength(1) @MaxLength(80) name: string }
class OrderDto { @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) ids: string[] }
class ImportDto { @IsUrl({ require_tld: false }) url: string; @IsOptional() @IsInt() @Min(1) @Max(20) servings?: number }

@ApiTags("shopping")
@Controller("households/:id")
export class ShoppingController {
  constructor(private shopping: ShoppingService, private recipes: RecipesService, private prisma: PrismaService, private pantry: PantryService,
              private sync: ListSyncService) {}

  // ── Aisles of the household (its store's sections), with where each one is bought ──
  @Get("aisles")
  async aisles(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    const h = await householdAccess(this.prisma, me, id);
    const s = settingsOf(h);
    return (await this.shopping.aisles(id)).map((a) => ({ ...a, area: s.storeAreas[a.name] ?? s.defaultArea }));
  }

  @HouseholdAdmin() @Post("aisles")
  async addAisle(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: AisleDto) { await this.shopping.addAisle(id, b.name); return this.aisles(me, id); }

  @HouseholdAdmin() @Patch("aisles/:aisle")
  async renameAisle(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("aisle") aisle: string, @Body() b: AisleDto) {
    await this.shopping.renameAisle(id, aisle, b.name); return this.aisles(me, id);
  }

  @HouseholdAdmin() @Delete("aisles/:aisle")
  async removeAisle(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("aisle") aisle: string) { await this.shopping.removeAisle(id, aisle); return this.aisles(me, id); }

  /** The aisles in the order of the store (the list follows it). */
  @HouseholdAdmin() @Put("aisles/order")
  async orderAisles(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: OrderDto) { await this.shopping.orderAisles(id, b.ids); return this.aisles(me, id); }

  @Get("shopping")
  async list(@CurrentUser() me: AuthUser, @Param("id") id: string) { await householdAccess(this.prisma, me, id); return this.shopping.list(id); }

  /** Adds an item ; without an aisle, it is guessed (pantry families, usual words). */
  @Post("shopping/items")
  async add(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: AddDto) {
    const h = await householdAccess(this.prisma, me, id);
    const text = b.text.trim();
    return this.shopping.add(id, text[0].toUpperCase() + text.slice(1), b.aisle || await this.sync.aisleOf(id, h.locale, text), b.area);
  }

  /** Changes an item: checked (then counted as bought today), text, aisle, list. */
  @Patch("shopping/items/:item")
  async update(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("item") item: string, @Body() b: UpdateDto) {
    await householdAccess(this.prisma, me, id);
    const x = await this.shopping.update(id, item, b);
    if (b.checked) await this.pantry.bought(id, x);   // pantry: bought today
    return { ok: true };
  }

  /** « We already have it »: the item leaves the list. */
  @Delete("shopping/items/:item")
  async remove(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("item") item: string) { await householdAccess(this.prisma, me, id); return this.shopping.remove(id, item); }

  @Post("shopping/clear-checked")
  async clear(@CurrentUser() me: AuthUser, @Param("id") id: string) { await householdAccess(this.prisma, me, id); return this.shopping.clearChecked(id); }

  /** Ingredients of the meals of a period → shopping list, prepared by the LLM (background job: { id }, read it on
   * /planning/jobs/:id) ; replaces a previous addition not yet checked. */
  @Post("shopping/from-meals")
  async fromMeals(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: StartDto) {
    await householdAccess(this.prisma, me, id); return this.shopping.fromMeals(id, b.start.slice(0, 10));
  }

  @Post("recipes/import")
  async import(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: ImportDto) {
    const h = await householdAccess(this.prisma, me, id);
    const servings = b.servings ?? Math.max(1, await this.prisma.member.count({ where: { householdId: id } }));
    return this.recipes.import(id, b.url, servings, h.locale);
  }
}
