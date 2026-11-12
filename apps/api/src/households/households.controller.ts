// Households: people who eat (members and their rules), the accounts that use the household, its connectors (Mealie
// first) and where each aisle is bought. Admins manage every household; users see theirs.
import { noteAdminAccess } from "../common/access";
import { presented } from "../recipes/recipe-view";
import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";
import { AuthUser, CurrentUser, HouseholdAdmin, Roles } from "../auth/decorators";
import type { ConnectorContext } from "@pantarr/connector-sdk";
import { ConnectorsService, IMPLEMENTED } from "../connectors/connectors.service";
import { mealieConnector } from "../connectors/mealie/mealie.connector";
import { AppError } from "../i18n/i18n";
import { config } from "../config";
import { ProvisioningService } from "../hosted/provisioning.service";
import { offeredInHosted } from "../connectors/registry";

const HOSTED_FIXED = ["promptTemplate", "llmMonthlyCalls", "receiptReader", "healthConsent"];
import { PrismaService } from "../prisma/prisma.service";
import { ALLERGENS, DIETS, label } from "./catalogue";
import { defaultSettings, HouseholdSettings, settingsOf, newHouseholdSettings } from "./households.defaults";

class HouseholdDto { @IsString() name: string; @IsOptional() @IsString() locale?: string }
class HouseholdPatchDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() locale?: string; @IsOptional() @IsObject() settings?: Partial<HouseholdSettings> }
class UsersDto { @IsArray() @IsString({ each: true }) userIds: string[]; @IsOptional() @IsArray() @IsString({ each: true }) ownerIds?: string[] }
class ConsentDto { @IsBoolean() given: boolean }
class MemberDto {
  @IsString() name: string; @IsOptional() @IsIn(["adult", "child"]) kind?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) allergies?: string[]; @IsOptional() @IsArray() @IsString({ each: true }) diets?: string[];
  @IsOptional() @IsISO8601() birthDate?: string | null; @IsOptional() @IsString() rules?: string; @IsOptional() @IsInt() position?: number;
}
class ConnectorDto { @IsBoolean() enabled: boolean; @IsObject() settings: Record<string, unknown> }
class RulesDto { @IsArray() @IsString({ each: true }) rules: string[] }
class PrefDto { @IsString() article: string; @IsString() product: string }
class PrefsDto { @IsArray() @ValidateNested({ each: true }) @Type(() => PrefDto) preferences: PrefDto[] }

@ApiTags("households")
@Controller("households")
export class HouseholdsController {
  constructor(private prisma: PrismaService, private connectors: ConnectorsService, private provisioning: ProvisioningService) {}

  private async access(me: AuthUser, id: string) {
    const h = await this.prisma.household.findUnique({ where: { id } });
    if (!h) throw new AppError(404, "households.notFound");
    if (me.role !== "ADMIN" && !(await this.prisma.membership.findUnique({ where: { userId_householdId: { userId: me.id, householdId: id } } }))) {
      throw new AppError(403, "auth.forbidden");
    }
    await noteAdminAccess(this.prisma, me, id, "household settings");
    return h;
  }

  @Get()
  list(@CurrentUser() me: AuthUser) {
    return this.prisma.household.findMany({
      // an administrator sees every household on a self-hosted instance ; hosted, only theirs (the others in the administration)
      where: me.role === "ADMIN" && config.mode !== "hosted" ? {} : { memberships: { some: { userId: me.id } } },
      include: { memberships: { select: { userId: true, role: true } }, _count: { select: { members: true } } }, orderBy: { createdAt: "asc" } });
  }

  @Roles("ADMIN") @Post()
  async create(@CurrentUser() me: AuthUser, @Body() b: HouseholdDto) {
    const locale = b.locale ?? me.locale;
    const h = await this.prisma.household.create({ data: { name: b.name, locale, settings: newHouseholdSettings(locale) as unknown as Prisma.InputJsonValue,
      memberships: { create: { userId: me.id, role: "owner" } } } });
    // hosted: its Mealie group (and starter recipes), as a household made by a sign-up
    await this.provisioning.provision(h.id).catch(() => undefined);
    return h;
  }

  @Get(":id")
  async get(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    const h = await this.access(me, id);
    return { ...h, settings: { ...defaultSettings(h.locale), ...(h.settings as object) } };
  }

  @HouseholdAdmin() @Patch(":id")
  async update(@Param("id") id: string, @Body() b: HouseholdPatchDto) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id } });
    // hosted: the advanced settings (planner prompt, LLM quota, receipt reader) are the platform's, not the household's
    const given = b.settings && config.mode === "hosted" ? Object.fromEntries(Object.entries(b.settings).filter(([k]) => !HOSTED_FIXED.includes(k))) : b.settings;
    const settings = given ? { ...(h.settings as object), ...given } : undefined;
    return this.prisma.household.update({ where: { id }, data: { name: b.name, locale: b.locale, ...(settings ? { settings: settings as Prisma.InputJsonValue } : {}) } });
  }

  @Roles("ADMIN") @Delete(":id")
  async remove(@Param("id") id: string) { await this.prisma.household.delete({ where: { id } }); return { ok: true }; }

  // ── Accounts of the household (Settings → Household): who can sign in to it, pending invitations ──
  @HouseholdAdmin() @Get(":id/accounts")
  async accounts(@Param("id") id: string) {
    const rows = await this.prisma.membership.findMany({ where: { householdId: id }, include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } } });
    const invites = await this.prisma.emailToken.findMany({ where: { kind: "invite", householdId: id, usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true }, orderBy: { createdAt: "desc" } });
    return { accounts: rows.map((r) => ({ ...r.user, role: r.role })).sort((a, b) => (a.role === "owner" ? -1 : 0) - (b.role === "owner" ? -1 : 0) || a.name.localeCompare(b.name)), invites };
  }

  /** Removes an account from the household (not oneself, not the last owner) ; the account itself stays. */
  @HouseholdAdmin() @Delete(":id/accounts/:user")
  async removeAccount(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("user") user: string) {
    if (user === me.id) throw new AppError(409, "households.removeSelf");
    const m = await this.prisma.membership.findUnique({ where: { userId_householdId: { userId: user, householdId: id } } });
    if (!m) throw new AppError(404, "users.notFound");
    if (m.role === "owner" && (await this.prisma.membership.count({ where: { householdId: id, role: "owner" } })) <= 1) throw new AppError(409, "households.lastOwner");
    await this.prisma.membership.delete({ where: { userId_householdId: { userId: user, householdId: id } } });
    return { ok: true };
  }

  @HouseholdAdmin() @Delete(":id/invites/:invite")
  async cancelInvite(@Param("id") id: string, @Param("invite") invite: string) {
    await this.prisma.emailToken.deleteMany({ where: { id: invite, kind: "invite", householdId: id } });
    return { ok: true };
  }

  @Roles("ADMIN") @Put(":id/users")
  async setUsers(@Param("id") id: string, @Body() b: UsersDto) {
    // Owners: the given ones, else the owners already there (who stay users)
    const owners = new Set(b.ownerIds ?? (await this.prisma.membership.findMany({ where: { householdId: id, role: "owner" } })).map((m) => m.userId));
    await this.prisma.$transaction([
      this.prisma.membership.deleteMany({ where: { householdId: id } }),
      this.prisma.membership.createMany({ data: b.userIds.map((userId) => ({ userId, householdId: id, role: owners.has(userId) ? "owner" : "member" })) }),
    ]);
    return { ok: true };
  }

  // ── Members (people who eat) ──
  @Get(":id/members")
  async members(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    await this.access(me, id);
    return this.prisma.member.findMany({ where: { householdId: id }, orderBy: [{ position: "asc" }, { name: "asc" }] });
  }

  /** Hosted: allergies and diets are health or religious data (GDPR art. 9), used only with the explicit consent of the
   * household (given by its owner, kept with its date). */
  private async sensitiveAllowed(id: string, b: { allergies?: string[]; diets?: string[] }) {
    if (config.mode !== "hosted" || (!b.allergies?.length && !b.diets?.length)) return;
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id } });
    if (!settingsOf(h).healthConsent) throw new AppError(409, "members.consentNeeded");
  }

  /** Consent given (date and person kept) or withdrawn: the allergies and diets of everyone are then erased. */
  @HouseholdAdmin() @Put(":id/health-consent")
  async healthConsent(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: ConsentDto) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id } });
    const healthConsent = b.given ? { at: new Date().toISOString(), by: me.id } : null;
    await this.prisma.$transaction([
      this.prisma.household.update({ where: { id }, data: { settings: { ...(h.settings as object), healthConsent } as Prisma.InputJsonValue } }),
      ...(b.given ? [] : [this.prisma.member.updateMany({ where: { householdId: id }, data: { allergies: [], diets: [] } })]),
    ]);
    return { healthConsent };
  }

  @HouseholdAdmin() @Post(":id/members")
  async addMember(@Param("id") id: string, @Body() b: MemberDto) {
    await this.sensitiveAllowed(id, b);
    return this.prisma.member.create({ data: { householdId: id, name: b.name, kind: b.kind ?? "adult", rules: b.rules ?? "",
      allergies: b.allergies ?? [], diets: b.diets ?? [],
      birthDate: b.birthDate ? new Date(b.birthDate) : null, position: b.position ?? 0 } });
  }

  @HouseholdAdmin() @Patch(":id/members/:mid")
  async updateMember(@Param("id") id: string, @Param("mid") mid: string, @Body() b: Partial<MemberDto>) {
    await this.sensitiveAllowed(id, b);
    return this.prisma.member.update({ where: { id: mid, householdId: id }, data: { name: b.name, kind: b.kind, rules: b.rules, position: b.position,
      allergies: b.allergies, diets: b.diets,
      ...(b.birthDate !== undefined ? { birthDate: b.birthDate ? new Date(b.birthDate) : null } : {}) } });
  }

  @HouseholdAdmin() @Delete(":id/members/:mid")
  async removeMember(@Param("id") id: string, @Param("mid") mid: string) {
    await this.prisma.member.delete({ where: { id: mid, householdId: id } });
    return { ok: true };
  }

  /** Allergens and diets offered for the members: built-in ones (translated) and the household's own. */
  @Get(":id/catalogue")
  async catalogue(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    const h = await this.access(me, id);
    const s = settingsOf(h), loc = me.locale;
    return {
      allergens: [...Object.keys(ALLERGENS).map((code) => ({ code, label: label(ALLERGENS, code, loc), builtIn: true })), ...s.customAllergens.map((code) => ({ code, label: code, builtIn: false }))],
      diets: [...Object.keys(DIETS).map((code) => ({ code, label: label(DIETS, code, loc), builtIn: true })), ...s.customDiets.map((code) => ({ code, label: code, builtIn: false }))],
    };
  }

  // ── Connectors of the household ──
  /** State of every connector of the household (enabled or not), for the Connectors page. */
  @HouseholdAdmin() @Get(":id/connectors")
  async connectorStates(@Param("id") id: string) {
    const rows = await this.prisma.connectorInstance.findMany({ where: { householdId: id }, select: { moduleId: true, enabled: true } });
    return Object.fromEntries(rows.map((r) => [r.moduleId, r.enabled]));
  }

  @HouseholdAdmin() @Get(":id/connectors/:module")
  readConnector(@Param("id") id: string, @Param("module") module: string) { return this.connectors.read(id, module); }

  @HouseholdAdmin() @Put(":id/connectors/:module")
  writeConnector(@Param("id") id: string, @Param("module") module: string, @Body() b: ConnectorDto) {
    // instance-wide connectors are set in the administration ; hosted: one-click connectors only (Mealie is provisioned)
    // (the stores of the browser extension: no setting, only on / off)
    const mf = this.connectors.manifest(module);
    if (config.mode === "hosted" && !offeredInHosted(mf) && !(mf.bridge && !Object.keys(b.settings ?? {}).length)) throw new AppError(403, "hosted.blocked");
    if (this.connectors.instanceWide(module)) throw new AppError(403, "connectors.instanceWide");
    return this.connectors.write(id, module, b.enabled, b.settings);
  }

  /** Tests a connector of the household (Mealie: who is connected; others: a short report). */
  @HouseholdAdmin() @Post(":id/connectors/:module/test")
  async testConnector(@Param("id") id: string, @Param("module") module: string) {
    const c = (IMPLEMENTED as Record<string, { test?: (ctx: ConnectorContext) => Promise<unknown> }>)[module];
    if (!c?.test) throw new AppError(404, "connectors.unknown");
    try {
      const ctx = await this.connectors.require(id, module);
      const h = await this.prisma.household.findUniqueOrThrow({ where: { id } });
      const r = await c.test({ ...ctx, settings: { timezone: settingsOf(h).timezone, ...ctx.settings } });
      return { ok: true, ...(typeof r === "string" ? { message: r } : (r as object)) };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  // ── Preferred products (« Water → Native »): typed by an admin, or learned from the choices in the cart panel ──
  @Get(":id/preferences")
  async preferences(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    await this.access(me, id);
    return this.prisma.productPreference.findMany({ where: { householdId: id }, orderBy: [{ learned: "asc" }, { article: "asc" }], select: { id: true, article: true, product: true, learned: true } });
  }

  /** Replaces the typed preferences (the learned ones stay unless « article » is typed again). */
  @HouseholdAdmin() @Put(":id/preferences")
  async setPreferences(@Param("id") id: string, @Body() b: PrefsDto) {
    const typed = b.preferences.filter((p) => p.article.trim() && p.product.trim());
    await this.prisma.$transaction([
      this.prisma.productPreference.deleteMany({ where: { householdId: id, OR: [{ learned: false }, { article: { in: typed.map((p) => p.article.trim()) } }] } }),
      this.prisma.productPreference.createMany({ data: typed.map((p) => ({ householdId: id, article: p.article.trim(), product: p.product.trim() })) }),
    ]);
    return { ok: true };
  }

  @Delete(":id/preferences/:pid")
  async removePreference(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("pid") pid: string) {
    await this.access(me, id);
    await this.prisma.productPreference.deleteMany({ where: { id: pid, householdId: id } });
    return { ok: true };
  }

  /** Online stores of the household (enabled cart connectors), for « Send to the online store » and the bridge. */
  @Get(":id/stores")
  async stores(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    await this.access(me, id);
    const rows = await this.prisma.connectorInstance.findMany({ where: { householdId: id, enabled: true } });
    // carts, and the other connectors that come with a browser script (Lidl Plus)
    return rows.map((r) => (IMPLEMENTED as Record<string, { manifest: { id: string; kind: string; name: string; siteUrl?: string }; bridgeScript?: unknown }>)[r.moduleId])
      .filter((c) => c && (c.manifest.kind === "cart" || typeof c.bridgeScript === "function"))
      .map((c) => ({ module: c!.manifest.id, name: c!.manifest.name, siteUrl: c!.manifest.siteUrl, kind: c!.manifest.kind }));
  }

  // ── Purchase rules (free text given to the planner: « minced steak: always frozen ») ──
  @Get(":id/purchase-rules")
  async purchaseRules(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    await this.access(me, id);
    return (await this.prisma.purchaseRule.findMany({ where: { householdId: id }, orderBy: { position: "asc" } })).map((r) => r.text);
  }

  @HouseholdAdmin() @Put(":id/purchase-rules")
  async setPurchaseRules(@Param("id") id: string, @Body() b: RulesDto) {
    await this.prisma.$transaction([
      this.prisma.purchaseRule.deleteMany({ where: { householdId: id } }),
      this.prisma.purchaseRule.createMany({ data: b.rules.filter((t) => t.trim()).map((text, position) => ({ householdId: id, text: text.trim(), position })) }),
    ]);
    return { ok: true };
  }

  // ── Read from Mealie ──
  @Get(":id/recipes")
  async recipes(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    await this.access(me, id);
    const ctx = await this.connectors.require(id, "mealie");
    const [list, ratings] = await Promise.all([mealieConnector.listRecipes(ctx), mealieConnector.ratings(ctx).catch(() => [])]);
    const rated = new Map(ratings.map((x) => [x.recipeId, x]));
    return presented(id, ctx, list as { id: string; slug: string; url: string; name: string; image?: string }[])
      .map((r) => ({ ...r, favorite: !!rated.get(r.id)?.isFavorite, rating: rated.get(r.id)?.rating ?? null }));
  }

}
