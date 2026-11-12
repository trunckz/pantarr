// Platform administration (role ADMIN, « super admin »): the whole site at a glance (accounts, households, LLM use and
// quotas, receipts, jobs and their errors, configuration, health), every household with its plan and quota (a quota
// can be set by hand for a beta or a gesture), every account (disable, role), invitation codes of the beta.
import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";
import { randomBytes } from "node:crypto";
import { AuthUser, CurrentUser, Roles } from "../auth/decorators";
import { config } from "../config";
import { AppError } from "../i18n/i18n";
import { planOf, plans } from "../hosted/plans";
import { LlmService } from "../planning/llm.service";
import { PrismaService } from "../prisma/prisma.service";

class HouseholdPatch {
  @IsOptional() @IsString() @MaxLength(40) plan?: string;
  /** null: back to the plan's quota */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(100000) quotaOverride?: number | null;
}
class UserPatch { @IsOptional() @IsBoolean() disabled?: boolean; @IsOptional() @IsIn(["ADMIN", "USER"]) role?: "ADMIN" | "USER" }
class CodeDto {
  @IsOptional() @IsString() @MaxLength(40) code?: string; @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(40) plan?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(10000) maxUses?: number; @IsOptional() @ValidateIf((_, v) => v !== null) @IsISO8601() expiresAt?: string | null;
  @IsOptional() @IsBoolean() disabled?: boolean;
}

const VERSION = process.env.npm_package_version ?? "0.1.0";
const month = () => { const d = new Date(); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); return d; };
/** Readable code without look-alike characters: « BETA-7KQ4-M2XP ». */
const newCode = () => "BETA-" + [0, 1].map(() => Array.from(randomBytes(4), (b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("")).join("-");

@ApiTags("admin")
@Roles("ADMIN")
@Controller("admin")
export class AdminController {
  constructor(private prisma: PrismaService, private llm: LlmService) {}

  /** The site at a glance. */
  @Get("overview")
  async overview() {
    const now = Date.now(), since = month(), d7 = new Date(now - 7 * 864e5), d30 = new Date(now - 30 * 864e5), d1 = new Date(now - 864e5);
    const p = this.prisma;
    const [users, verified, disabled, admins, signups7, signups30, active7, households, ownKeys, mealieGroups, byPlan] = await Promise.all([
      p.user.count(), p.user.count({ where: { emailVerifiedAt: { not: null } } }), p.user.count({ where: { disabled: true } }), p.user.count({ where: { role: "ADMIN" } }),
      p.user.count({ where: { createdAt: { gte: d7 } } }), p.user.count({ where: { createdAt: { gte: d30 } } }), p.user.count({ where: { lastLoginAt: { gte: d7 } } }),
      p.household.count(), p.connectorInstance.count({ where: { kind: "llm", enabled: true } }), p.household.count({ where: { mealieGroupId: { not: null } } }),
      p.household.groupBy({ by: ["plan"], _count: true })]);
    const [llmMonth, llmFailed, byPurpose, byConnector, daily] = await Promise.all([
      p.llmUsage.aggregate({ where: { at: { gte: since } }, _count: true, _sum: { inputTokens: true, outputTokens: true } }),
      p.llmUsage.count({ where: { at: { gte: since }, ok: false } }),
      p.llmUsage.groupBy({ by: ["purpose"], where: { at: { gte: since } }, _count: true }),
      p.llmUsage.groupBy({ by: ["connector"], where: { at: { gte: since } }, _count: true, _sum: { inputTokens: true, outputTokens: true } }),
      p.$queryRaw<{ day: Date; calls: bigint; tokens: bigint | null }[]>`SELECT date_trunc('day', "at") AS day, count(*) AS calls, sum("inputTokens" + "outputTokens") AS tokens
        FROM "LlmUsage" WHERE "at" >= ${d30} GROUP BY 1 ORDER BY 1`]);
    const [receipts, receiptStatus, receiptSource, receiptBytes, products, purchases, drafts] = await Promise.all([
      p.receipt.count(), p.receipt.groupBy({ by: ["status"], _count: true }), p.receipt.groupBy({ by: ["source"], _count: true }),
      p.$queryRaw<{ bytes: bigint | null }[]>`SELECT sum(octet_length("data")) AS bytes FROM "Receipt"`,
      p.product.count(), p.purchase.count(), p.mealPlanDraft.count()]);
    const [running, failed, lastErrors, codes, dbSize] = await Promise.all([
      p.job.count({ where: { status: "running" } }), p.job.count({ where: { status: "failed", createdAt: { gte: d1 } } }),
      p.job.findMany({ where: { status: "failed" }, orderBy: { createdAt: "desc" }, take: 12, select: { kind: true, error: true, createdAt: true, householdId: true } }),
      p.signupCode.aggregate({ _count: true, _sum: { uses: true, maxUses: true } }),
      p.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`]);
    const names = new Map((await p.household.findMany({ where: { id: { in: lastErrors.map((e) => e.householdId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((h) => [h.id, h.name]));
    let mealie: "ok" | "unreachable" | "not configured" = "not configured";
    if (config.hosted.mealieUrl) {
      mealie = await fetch(`${config.hosted.mealieUrl}/api/app/about`, { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? "ok" : "unreachable")).catch(() => "unreachable" as const);
    }
    const num = (x: bigint | number | null | undefined) => Number(x ?? 0);
    return {
      site: { version: VERSION, mode: config.mode, signup: config.mode === "hosted" ? config.signup : "closed", baseUrl: config.baseUrl, uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 2 ** 20), databaseMb: Math.round(num(dbSize[0]?.size) / 2 ** 20),
        mail: !!config.smtpUrl, mealie, platformLlm: config.hosted.geminiKey ? config.hosted.geminiModel : null, billing: config.billing.provider || null,
        plans: plans().map((x) => ({ code: x.code, name: x.name, llmMonthlyCalls: x.llmMonthlyCalls, maxAccounts: x.maxAccounts })) },
      accounts: { total: users, verified, disabled, admins, signups7, signups30, active7 },
      households: { total: households, withOwnLlm: ownKeys, mealieProvisioned: mealieGroups, byPlan: Object.fromEntries(byPlan.map((x) => [x.plan, x._count])) },
      llm: { since: since.toISOString().slice(0, 10), calls: llmMonth._count, failed: llmFailed, inputTokens: num(llmMonth._sum.inputTokens), outputTokens: num(llmMonth._sum.outputTokens),
        byPurpose: Object.fromEntries(byPurpose.map((x) => [x.purpose, x._count])),
        byConnector: byConnector.map((x) => ({ connector: x.connector, calls: x._count, tokens: num(x._sum.inputTokens) + num(x._sum.outputTokens) })),
        daily: daily.map((x) => ({ day: x.day.toISOString().slice(0, 10), calls: num(x.calls), tokens: num(x.tokens) })) },
      data: { receipts, receiptsMb: Math.round(num(receiptBytes[0]?.bytes) / 2 ** 20 * 10) / 10, receiptStatus: Object.fromEntries(receiptStatus.map((x) => [x.status, x._count])),
        receiptSource: Object.fromEntries(receiptSource.map((x) => [x.source, x._count])), products, purchases, drafts },
      jobs: { running, failed24h: failed, lastErrors: lastErrors.map((e) => ({ kind: e.kind, error: e.error, at: e.createdAt, household: e.householdId ? names.get(e.householdId) ?? e.householdId : null })) },
      codes: { total: codes._count, uses: num(codes._sum.uses), capacity: num(codes._sum.maxUses) },
    };
  }

  /** Every household: owners, accounts, plan, quota of the month (used / available), activity. */
  @Get("households")
  async households() {
    const since = month();
    const rows = await this.prisma.household.findMany({ orderBy: { createdAt: "desc" }, include: {
      memberships: { include: { user: { select: { email: true, name: true, lastLoginAt: true, disabled: true } } } },
      _count: { select: { members: true, receipts: true, drafts: true, products: true } },
      connectors: { where: { enabled: true }, select: { moduleId: true, kind: true } } } });
    const usage = await this.prisma.llmUsage.groupBy({ by: ["householdId"], where: { at: { gte: since } }, _count: true, _sum: { inputTokens: true, outputTokens: true }, _max: { at: true } });
    const codes = new Map((await this.prisma.signupCode.findMany({ select: { id: true, code: true, label: true } })).map((c) => [c.id, c]));
    const out = [];
    for (const h of rows) {
      const u = usage.find((x) => x.householdId === h.id);
      const q = await this.llm.usage(h.id);
      const logins = h.memberships.map((m) => m.user.lastLoginAt?.getTime() ?? 0);
      out.push({ id: h.id, name: h.name, createdAt: h.createdAt, locale: h.locale,
        owners: h.memberships.filter((m) => m.role === "owner").map((m) => m.user.email), accounts: h.memberships.length, people: h._count.members,
        plan: planOf(h).code, planWanted: h.plan, planStatus: h.planStatus, quotaOverride: h.quotaOverride,
        quota: { used: q.calls, limit: q.limit, tokens: Number(u?._sum.inputTokens ?? 0) + Number(u?._sum.outputTokens ?? 0) },
        ownLlm: h.connectors.some((c) => c.kind === "llm"), connectors: h.connectors.map((c) => c.moduleId), mealieGroup: !!h.mealieGroupId,
        receipts: h._count.receipts, drafts: h._count.drafts, products: h._count.products,
        lastActivity: new Date(Math.max(u?._max.at?.getTime() ?? 0, ...logins, h.createdAt.getTime())),
        code: h.signupCodeId ? codes.get(h.signupCodeId) ?? null : null });
    }
    return out;
  }

  @Patch("households/:id")
  async patchHousehold(@Param("id") id: string, @Body() b: HouseholdPatch) {
    if (b.plan !== undefined && !plans().some((x) => x.code === b.plan)) throw new AppError(400, "admin.unknownPlan");
    await this.prisma.household.update({ where: { id }, data: { ...(b.plan !== undefined ? { plan: b.plan, planStatus: null } : {}), ...(b.quotaOverride !== undefined ? { quotaOverride: b.quotaOverride } : {}) } });
    return { ok: true };
  }

  /** Every account with its households. */
  @Get("users")
  async users() {
    return (await this.prisma.user.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, email: true, name: true, role: true, disabled: true, createdAt: true,
      lastLoginAt: true, emailVerifiedAt: true, oidcSubject: true, memberships: { select: { role: true, household: { select: { id: true, name: true } } } } } }))
      .map(({ oidcSubject, memberships, ...u }) => ({ ...u, sso: !!oidcSubject, households: memberships.map((m) => ({ id: m.household.id, name: m.household.name, role: m.role })) }));
  }

  @Patch("users/:id")
  async patchUser(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: UserPatch) {
    if (id === me.id && (b.disabled || b.role === "USER")) throw new AppError(400, "admin.notYourself");
    await this.prisma.user.update({ where: { id }, data: b });
    return { ok: true };
  }

  // ── Invitation codes ──
  @Get("signup-codes")
  codes() { return this.prisma.signupCode.findMany({ orderBy: { createdAt: "desc" } }); }

  @Post("signup-codes")
  async createCode(@Body() b: CodeDto) {
    if (b.plan && !plans().some((x) => x.code === b.plan)) throw new AppError(400, "admin.unknownPlan");
    const code = (b.code ?? newCode()).toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (code.length < 4) throw new AppError(400, "admin.badCode");
    if (await this.prisma.signupCode.findUnique({ where: { code } })) throw new AppError(409, "admin.codeTaken");
    return this.prisma.signupCode.create({ data: { code, label: b.label ?? "", plan: b.plan ?? null, maxUses: b.maxUses ?? 1, expiresAt: b.expiresAt ? new Date(b.expiresAt) : null } });
  }

  @Patch("signup-codes/:id")
  patchCode(@Param("id") id: string, @Body() b: CodeDto) {
    return this.prisma.signupCode.update({ where: { id }, data: { ...(b.label !== undefined ? { label: b.label } : {}), ...(b.plan !== undefined ? { plan: b.plan } : {}),
      ...(b.maxUses !== undefined ? { maxUses: b.maxUses } : {}), ...(b.expiresAt !== undefined ? { expiresAt: b.expiresAt ? new Date(b.expiresAt) : null } : {}),
      ...(b.disabled !== undefined ? { disabled: b.disabled } : {}) } });
  }

  @Delete("signup-codes/:id")
  async deleteCode(@Param("id") id: string) {
    const c = await this.prisma.signupCode.findUniqueOrThrow({ where: { id } });
    if (c.uses) throw new AppError(409, "admin.codeUsed");   // used codes stay (they say where a household comes from): disable them
    await this.prisma.signupCode.delete({ where: { id } });
    return { ok: true };
  }
}
