// Recipes from the browser extension (a « bridge » key): « Add to Pantarr » on the page of a recipe, or every recipe
// listed on a page (the user's favourites on the recipe site, a notebook, a search), one at a time.
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsString, IsUrl, MaxLength } from "class-validator";
import { AuthUser, CurrentUser } from "../auth/decorators";
import { householdAccess } from "../common/access";
import { config } from "../config";
import { PrismaService } from "../prisma/prisma.service";
import { RecipesService } from "./recipes.service";

class UrlDto { @IsString() @MaxLength(2000) @IsUrl({ protocols: ["https", "http"], require_protocol: true }) url: string }

@ApiTags("bridge")
@Controller("bridge/recipes")
export class RecipesBridgeController {
  constructor(private prisma: PrismaService, private recipes: RecipesService) {}

  /** The household (its name for the button) and whether this recipe is already there. */
  @Get("known")
  async known(@CurrentUser() me: AuthUser, @Query("household") household: string, @Query("url") url: string) {
    const h = await householdAccess(this.prisma, me, household);
    return { household: h.name, base: config.baseUrl, ...(url ? await this.recipes.known(household, url) : { known: false }) };
  }

  /** Imports the recipe of the address (Mealie reads the page), for as many people as the household counts. */
  @Post("import")
  async import(@CurrentUser() me: AuthUser, @Query("household") household: string, @Body() b: UrlDto) {
    const h = await householdAccess(this.prisma, me, household);
    const people = await this.prisma.member.count({ where: { householdId: household } });
    const r = await this.recipes.import(household, b.url, Math.min(12, Math.max(2, people || 4)), h.locale);
    return { ...r, base: config.baseUrl };
  }
}
