// Browser bridge: routes called by the userscript running on a store site, authenticated by a « bridge » API key of
// the user (header, or ?k= for the userscript download), CORS allowed for the store's own site only.
import { Body, Controller, Get, Header, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { CartConnector } from "@pantarr/connector-sdk";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsNumber, IsNumberString, IsOptional, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import type { Request, Response } from "express";
import { AuthUser, CurrentUser, Public } from "../auth/decorators";
import { householdAccess } from "../common/access";
import { key } from "../common/text";
import { config } from "../config";
import { settingsOf } from "../households/households.defaults";
import { IMPLEMENTED } from "../connectors/connectors.service";
import { AppError } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";
import { rawBody } from "../pantry/inbound.controller";
import { ReceiptsService } from "../pantry/receipts.service";
import { ShoppingService } from "../shopping/shopping.service";

class ChoiceDto { @IsString() article: string; @IsString() product: string }
class OrderItem { @IsString() @MaxLength(200) name: string; @IsNumber() quantity: number; @IsOptional() @IsNumber() price?: number | null }
class IdsDto { @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) ids: string[] }
class LidlItem { @IsString() @MaxLength(200) name: string; @IsNumber() quantity: number; @IsOptional() @IsNumber() unitPrice?: number | null; @IsOptional() @IsNumber() discount?: number }
class LidlReceipt {
  @IsString() @MaxLength(100) id: string; @IsString() @MaxLength(30) date: string; @IsOptional() @IsString() @MaxLength(200) store?: string;
  @IsOptional() @IsString() @MaxLength(400000) html?: string; @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => LidlItem) items: LidlItem[];
}
class LidlDto { @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => LidlReceipt) receipts: LidlReceipt[] }
class Transaction { @IsString() @MaxLength(80) id: string; @IsString() @MaxLength(10) date: string }
class TransactionsDto { @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => Transaction) transactions: Transaction[] }
class TicketQuery { @IsString() @MaxLength(80) transaction: string; @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string; @IsOptional() @IsNumberString() n?: string;
  @IsOptional() @IsString() household?: string }
class EmptyDto { @IsString() @MaxLength(80) id: string }
class OrderDto { @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => OrderItem) items: OrderItem[] }
const VERSION = "14";   // raised when a userscript changes (Tampermonkey offers the update)

/** A connector with a browser script (store carts, Lidl Plus receipts). */
export function bridgeConnector(module: string): { manifest: { id: string; kind: string; name: string }; bridgeScript: (c: { api: string; key: string; version: string; household?: string }) => string } {
  const c = (IMPLEMENTED as unknown as Record<string, { manifest: { id: string; kind: string; name: string; bridge?: boolean }; bridgeScript?: unknown }>)[module];
  if (!c?.manifest.bridge || typeof c.bridgeScript !== "function") throw new AppError(404, "connectors.unknown");
  return c as ReturnType<typeof bridgeConnector>;
}

export function cartConnector(module: string): CartConnector {
  const c = (IMPLEMENTED as unknown as Record<string, CartConnector>)[module];
  if (!c || c.manifest.kind !== "cart") throw new AppError(404, "connectors.unknown");
  return c;
}

/** Quantity of an item « Couches (2 paquets) » / « Pâtes (500 g) » : the number when it counts units, else 1. */
export function units(text: string): number {
  const m = text.match(/\((\d+)\s*([^)]*)\)/);
  return m && !/^(g|kg|ml|cl|l|mg)$/i.test(m[2].trim()) && +m[1] <= 20 ? +m[1] : 1;
}

@ApiTags("bridge")
@Controller("bridge/:module")
export class BridgeController {
  constructor(private prisma: PrismaService, private shopping: ShoppingService, private receipts: ReceiptsService) {}

  /** The userscript of the store, configured with the user's bridge key (?k=). */
  @Public() @Get("userscript.user.js") @Header("Content-Type", "text/javascript; charset=utf-8") @Header("Cache-Control", "no-store")
  async userscript(@Param("module") module: string, @Query("k") k: string, @Query("h") h: string, @CurrentUser() me: AuthUser, @Res() res: Response) {
    if (!me || !me.scopes.includes("bridge")) throw new AppError(401, "auth.required");
    res.send(bridgeConnector(module).bridgeScript({ api: `${config.baseUrl}/api/v1`, key: k, version: VERSION, household: h }));
  }

  /** Items to buy online (not checked), with the usual product and the preferred one of each. */
  @Get("cart")
  async cart(@CurrentUser() me: AuthUser, @Param("module") module: string, @Query("household") household: string) {
    cartConnector(module);
    await householdAccess(this.prisma, me, household);
    const list = await this.shopping.list(household);
    const prefs = await this.prisma.productPreference.findMany({ where: { householdId: household }, orderBy: { updatedAt: "desc" } });
    const preferred = (text: string) => {
      const words = new Set(key(text.replace(/\(.*?\)/g, "")).split(" ").map((w) => w.replace(/[sx]$/, "")));
      return prefs.find((p) => key(p.article).split(" ").every((w) => words.has(w.replace(/[sx]$/, ""))))?.product;
    };
    const s = settingsOf(await this.prisma.household.findUniqueOrThrow({ where: { id: household } }));
    return { brands: { like: s.preferredBrands ?? [], ban: s.bannedBrands ?? [] }, items: list.items.filter((x) => x.area === "online" && !x.checked)
      .map((x) => ({ id: x.id, t: x.text, q: units(x.text), ...(x.aisle ? { a: x.aisle } : {}), ...(x.product ? { p: x.product } : {}), ...(preferred(x.text) ? { r: preferred(x.text) } : {}) })) };
  }

  /** Usual products for the matching in the panel: label, channel, number of purchase days, last purchase. */
  @Get("products")
  async products(@CurrentUser() me: AuthUser, @Param("module") module: string, @Query("household") household: string) {
    cartConnector(module);
    await householdAccess(this.prisma, me, household);
    const rows = await this.prisma.product.findMany({ where: { householdId: household }, include: { purchases: { select: { date: true } } } });
    return rows.map((p) => {
      const days = [...new Set(p.purchases.map((x) => x.date.toISOString().slice(0, 10)))].sort();
      return { l: p.label, s: p.channel === "online" ? "drive" : "magasin", n: days.length, d: days.at(-1) ?? "" };
    }).filter((p) => p.n).sort((a, b) => (b.s === "drive" ? 1 : 0) - (a.s === "drive" ? 1 : 0) || b.n - a.n);
  }

  /** A product chosen by hand in the panel: remembered as a (learned) preference of the household. */
  @Post("choice")
  async choice(@CurrentUser() me: AuthUser, @Param("module") module: string, @Query("household") household: string, @Body() b: ChoiceDto) {
    cartConnector(module);
    await householdAccess(this.prisma, me, household);
    const article = b.article.replace(/\(.*?\)/g, "").trim();
    const old = await this.prisma.productPreference.findFirst({ where: { householdId: household, article } });
    if (old?.learned === false) return { ok: true };   // a preference typed in the settings wins
    if (old) await this.prisma.productPreference.update({ where: { id: old.id }, data: { product: b.product } });
    else await this.prisma.productPreference.create({ data: { householdId: household, article, product: b.product, learned: true } });
    return { ok: true };
  }

  /** Products just added to the store's basket by the panel: bought today (purchase history, without any invoice). */
  @Post("order")
  async order(@CurrentUser() me: AuthUser, @Param("module") module: string, @Query("household") household: string, @Body() b: OrderDto) {
    const store = cartConnector(module).manifest.name.split(" —")[0];
    await householdAccess(this.prisma, me, household);
    return this.receipts.order(household, store, b.items);
  }

  // ── Intermarché: in-store receipts of the customer account ──
  /** Which of these purchases Pantarr does not have yet. */
  @Post("tickets/unknown")
  async ticketsUnknown(@CurrentUser() me: AuthUser, @Param("module") module: string, @Query("household") household: string, @Body() b: TransactionsDto) {
    if (module !== "intermarche-purchases") throw new AppError(404, "connectors.unknown");
    await householdAccess(this.prisma, me, household);
    return { ids: await this.receipts.unknownIntermarche(household, b.transactions) };
  }

  /** One receipt (PDF, raw body) of a purchase: read like any receipt, once. */
  @Post("tickets")
  async ticket(@CurrentUser() me: AuthUser, @Param("module") module: string, @Query("household") household: string, @Query() q: TicketQuery, @Req() req: Request) {
    if (module !== "intermarche-purchases") throw new AppError(404, "connectors.unknown");
    await householdAccess(this.prisma, me, household);
    const data = await rawBody(req, 5 * 1024 * 1024);
    if (data.subarray(0, 5).toString() !== "%PDF-") throw new AppError(400, "receipts.type");
    return this.receipts.addIntermarche(household, { transaction: q.transaction, date: q.date, n: Number(q.n) || 0 }, data);
  }

  /** A purchase with only the bank card slip. */
  @Post("tickets/empty")
  async ticketEmpty(@CurrentUser() me: AuthUser, @Param("module") module: string, @Query("household") household: string, @Body() b: EmptyDto) {
    if (module !== "intermarche-purchases") throw new AppError(404, "connectors.unknown");
    await householdAccess(this.prisma, me, household);
    return this.receipts.noReceiptIntermarche(household, b.id);
  }

  /** Lidl Plus: which of these receipts Pantarr does not have yet. */
  @Post("unknown")
  async unknown(@CurrentUser() me: AuthUser, @Param("module") module: string, @Query("household") household: string, @Body() b: IdsDto) {
    if (module !== "lidl-plus") throw new AppError(404, "connectors.unknown");
    await householdAccess(this.prisma, me, household);
    return { ids: await this.receipts.unknownLidl(household, b.ids) };
  }

  /** Lidl Plus: new receipts read in the user's Lidl account. */
  @Post("receipts")
  async lidl(@CurrentUser() me: AuthUser, @Param("module") module: string, @Query("household") household: string, @Body() b: LidlDto) {
    if (module !== "lidl-plus") throw new AppError(404, "connectors.unknown");
    await householdAccess(this.prisma, me, household);
    return this.receipts.importLidl(household, b.receipts);
  }
}
