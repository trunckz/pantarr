import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from "class-validator";
import { AuthUser, CurrentUser, HouseholdAdmin } from "../auth/decorators";
import { householdAccess } from "../common/access";
import { PrismaService } from "../prisma/prisma.service";
import { PantryService } from "./pantry.service";
import { PurchasesService } from "./purchases.service";

class FamilyDto {
  @IsString() name: string; @IsString() category: string; @IsString() aisle: string;
  @IsArray() @IsString({ each: true }) keywords: string[]; @IsOptional() @IsArray() @IsString({ each: true }) excludes?: string[];
}
class FamilyPatchDto {
  @IsOptional() @IsString() name?: string; @IsOptional() @IsString() category?: string; @IsOptional() @IsString() aisle?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) keywords?: string[]; @IsOptional() @IsArray() @IsString({ each: true }) excludes?: string[];
  @IsOptional() @IsInt() @Min(1) forcedDays?: number | null;
}
class ImportDto { @IsOptional() @IsBoolean() full?: boolean }

@ApiTags("pantry")
@Controller("households/:id")
export class PantryController {
  constructor(private pantry: PantryService, private purchases: PurchasesService, private prisma: PrismaService) {}

  /** Every product family with its estimate (to buy, soon, ok, no longer bought, unknown). */
  @Get("pantry")
  async overview(@CurrentUser() me: AuthUser, @Param("id") id: string) { await householdAccess(this.prisma, me, id); return this.pantry.overview(id); }

  @Post("pantry/:family/still-have")
  async stillHave(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("family") family: string) { await householdAccess(this.prisma, me, id); return this.pantry.stillHave(id, family); }

  @Post("pantry/:family/add-to-list")
  async addToList(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("family") family: string) { await householdAccess(this.prisma, me, id); return this.pantry.addToList(id, family); }

  @HouseholdAdmin() @Post("pantry/families")
  create(@Param("id") id: string, @Body() b: FamilyDto) { return this.pantry.createFamily(id, b); }

  @HouseholdAdmin() @Patch("pantry/families/:family")
  update(@Param("id") id: string, @Param("family") family: string, @Body() b: FamilyPatchDto) { return this.pantry.updateFamily(id, family, b); }

  @HouseholdAdmin() @Delete("pantry/families/:family")
  remove(@Param("id") id: string, @Param("family") family: string) { return this.pantry.deleteFamily(id, family); }

  /** Import of the purchases (documents of the stores) now ; « full » re-reads every document. */
  @Post("purchases/import")
  async import(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: ImportDto) { await householdAccess(this.prisma, me, id); return this.purchases.import(id, !!b.full); }

  @Get("purchases/summary")
  async summary(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    await householdAccess(this.prisma, me, id);
    const [products, purchases, last] = await Promise.all([
      this.prisma.product.count({ where: { householdId: id } }),
      this.prisma.purchase.count({ where: { product: { householdId: id } } }),
      this.prisma.purchase.findFirst({ where: { product: { householdId: id } }, orderBy: { date: "desc" }, select: { date: true } }),
    ]);
    return { products, purchases, lastPurchase: last?.date.toISOString().slice(0, 10) ?? null };
  }

  /** Products bought for an article (habitual products: cart, phase 5). */
  @Get("products")
  async products(@CurrentUser() me: AuthUser, @Param("id") id: string, @Query("q") q: string) { await householdAccess(this.prisma, me, id); return this.pantry.productsFor(id, q ?? ""); }
}
