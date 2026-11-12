// Personal data in self-service (GDPR art. 15, 17, 20), on every instance: export of the account and of a household
// (JSON, secrets of the connectors left out), deletion of the account with the households it is alone in (and their
// Mealie group in hosted mode). A running subscription must be cancelled first.
import { Body, Controller, Delete, Get, Header, Param, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { verify } from "@node-rs/argon2";
import { IsOptional, IsString } from "class-validator";
import type { Response } from "express";
import { SESSION_COOKIE } from "../auth/auth.guard";
import { AuthUser, CurrentUser, HouseholdAdmin } from "../auth/decorators";
import { AppError } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";
import { ProvisioningService } from "./provisioning.service";

class ConfirmDto { @IsOptional() @IsString() password?: string; @IsOptional() @IsString() email?: string }

@ApiTags("account")
@Controller()
export class GdprController {
  constructor(private prisma: PrismaService, private provisioning: ProvisioningService) {}

  /** Everything Pantarr keeps about a household (the recipes, meal plans and lists themselves are in Mealie). */
  async household(id: string) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id }, include: {
      members: true, drafts: true, feedback: true, purchaseRules: true, preferences: true, llmUsage: true, listLinks: true,
      pantryFamilies: { include: { events: true } }, products: { include: { purchases: true } },
      receipts: { select: { id: true, source: true, filename: true, mimeType: true, status: true, store: true, date: true, channel: true, reader: true, purchases: true, createdAt: true } },
      connectors: { select: { moduleId: true, kind: true, enabled: true, settings: true, createdAt: true } },
      memberships: { select: { role: true, user: { select: { email: true, name: true } } } } } });
    return { ...h, billingCustomer: undefined, billingSubscription: undefined };
  }

  @HouseholdAdmin() @Get("households/:id/export") @Header("Content-Disposition", "attachment; filename=pantarr-household.json")
  exportHousehold(@Param("id") id: string) { return this.household(id); }

  @Get("users/me/export") @Header("Content-Disposition", "attachment; filename=pantarr-account.json")
  async exportMe(@CurrentUser() me: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { email: true, name: true, role: true, locale: true, createdAt: true,
      lastLoginAt: true, emailVerifiedAt: true, oidcSubject: true, apiKeys: { select: { name: true, prefix: true, scopes: true, createdAt: true, lastUsedAt: true } },
      memberships: { select: { householdId: true, role: true } } } });
    const households = [];
    for (const m of u.memberships) households.push(await this.household(m.householdId));
    return { exportedAt: new Date().toISOString(), account: u, households };
  }

  /** Deletes the account, and the households where it is the only account. Confirmed by the password (or the e-mail
   * for SSO accounts without one). */
  @Delete("users/me")
  async deleteMe(@CurrentUser() me: AuthUser, @Body() b: ConfirmDto, @Res({ passthrough: true }) res: Response) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id }, include: { memberships: true } });
    const confirmed = u.passwordHash ? !!b.password && await verify(u.passwordHash, b.password) : b.email?.toLowerCase() === u.email;
    if (!confirmed) throw new AppError(403, "gdpr.confirm");
    if (u.role === "ADMIN" && (await this.prisma.user.count({ where: { role: "ADMIN", disabled: false } })) <= 1) throw new AppError(409, "users.lastAdmin");
    const alone = [];
    for (const m of u.memberships) if ((await this.prisma.membership.count({ where: { householdId: m.householdId } })) === 1) alone.push(m.householdId);
    const subscribed = await this.prisma.household.count({ where: { id: { in: alone }, planStatus: { in: ["active", "trialing", "past_due", "paused"] } } });
    if (subscribed) throw new AppError(409, "billing.activeSubscription");
    for (const id of alone) await this.provisioning.remove(id);
    await this.prisma.$transaction([
      this.prisma.household.deleteMany({ where: { id: { in: alone } } }),
      this.prisma.emailToken.deleteMany({ where: { OR: [{ userId: u.id }, { email: u.email }] } }),
      this.prisma.user.delete({ where: { id: u.id } }),
    ]);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true, households: alone.length };
  }
}
