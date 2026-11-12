// Sign-up (hosted mode, or with an invitation on any instance), address check by e-mail, invitations to a household.
// A sign-up without invitation creates its own household (owner) ; the shared Mealie group is provisioned once the
// address is checked. Answers never tell whether an address has an account (except the sign-up itself).
import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import { decrypt, encrypt } from "../common/crypto";
import { nonce, nonceCookie, SOCIAL_COOKIE, socialAuthorizeUrl, socialIdentity, socialProviders, type SocialProvider } from "../connectors/oauth/oauth";
import { ApiTags } from "@nestjs/swagger";
import type { Prisma } from "@prisma/client";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { Request, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { AuthService } from "../auth/auth.service";
import { AuthUser, CurrentUser, HouseholdAdmin, Public, Roles } from "../auth/decorators";
import { hash as hashPassword } from "@node-rs/argon2";
import { config } from "../config";
import { newHouseholdSettings } from "../households/households.defaults";
import { AppError, languages } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";
import { MailerService } from "./mailer.service";
import { planOf } from "./plans";
import { ProvisioningService } from "./provisioning.service";

class SignupDto {
  @IsEmail() email: string; @IsString() @MinLength(1) @MaxLength(80) name: string; @IsString() @MinLength(10) @MaxLength(200) password: string;
  @IsOptional() @IsString() locale?: string; @IsOptional() @IsString() @MaxLength(80) household?: string; @IsOptional() @IsString() invite?: string;
  /** invitation code (sign-up mode « code ») */
  @IsOptional() @IsString() @MaxLength(40) code?: string;
}
class EmailDto { @IsEmail() email: string }
class ResetDto { @IsString() @MaxLength(200) token: string; @IsString() @MinLength(10) @MaxLength(200) password: string }
class InviteDto { @IsEmail() email: string; @IsOptional() @IsIn(["owner", "member"]) role?: string }

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const DAY = 864e5;

@ApiTags("auth")
@Controller()
export class SignupController {
  constructor(private prisma: PrismaService, private auth: AuthService, private mail: MailerService, private provisioning: ProvisioningService) {}

  private async token(kind: "verify" | "invite" | "reset", email: string, days: number, extra: { userId?: string; householdId?: string; role?: string }) {
    const raw = randomBytes(32).toString("base64url");
    await this.prisma.emailToken.create({ data: { kind, email: email.toLowerCase(), hash: sha(raw), expiresAt: new Date(Date.now() + days * DAY), ...extra } });
    return raw;
  }

  private async valid(kind: string, raw: string) {
    const t = raw ? await this.prisma.emailToken.findUnique({ where: { hash: sha(raw) } }) : null;
    if (!t || t.kind !== kind || t.usedAt || t.expiresAt < new Date()) throw new AppError(400, "signup.badToken");
    return t;
  }

  private async sendCheck(u: { id: string; email: string; name: string; locale: string }) {
    const raw = await this.token("verify", u.email, 2, { userId: u.id });
    await this.mail.send(u.email, u.locale, "verify", { name: u.name, link: `${config.baseUrl}/api/v1/auth/verify?token=${raw}` });
  }

  /** An invitation code that can still be used (case and spaces ignored). */
  private async codeFor(raw: string | undefined) {
    const code = (raw ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const c = code ? await this.prisma.signupCode.findUnique({ where: { code } }) : null;
    if (!c || c.disabled || c.uses >= c.maxUses || (c.expiresAt && c.expiresAt < new Date())) throw new AppError(400, "signup.badCode");
    return c;
  }

  /** Whether an invitation code can be used (the sign-up form checks it before asking for the rest). */
  @Public() @Get("auth/signup-code")
  async checkCode(@Query("code") code: string) {
    const c = await this.codeFor(code);
    return { ok: true, label: c.label };
  }

  /** What the sign-up form of an invitation shows. */
  @Public() @Get("auth/invite")
  async invite(@Query("token") token: string) {
    const t = await this.valid("invite", token);
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: t.householdId! } });
    return { email: t.email, household: h.name };
  }

  @Public() @Post("auth/signup")
  async signup(@Body() b: SignupDto) {
    const invite = b.invite ? await this.valid("invite", b.invite) : null;
    if (!invite && (config.mode !== "hosted" || config.signup === "closed")) throw new AppError(403, "signup.closed");
    // Sign-up mode « code »: a valid invitation code, checked here and used once the account exists
    const code = !invite && config.signup === "code" ? await this.codeFor(b.code) : null;
    if (invite && invite.email !== b.email.toLowerCase()) throw new AppError(400, "signup.badToken");
    if (await this.prisma.user.findUnique({ where: { email: b.email.toLowerCase() } })) throw new AppError(409, "signup.taken");
    const locale = languages.includes(b.locale ?? "") ? b.locale! : config.defaultLocale;
    // An invitation proves the address: no check needed
    const u = await this.auth.createUser({ email: b.email, name: b.name, password: b.password, locale, verified: !!invite });
    if (invite) {
      await this.joinable(invite.householdId!);
      await this.prisma.membership.create({ data: { userId: u.id, householdId: invite.householdId!, role: invite.role === "owner" ? "owner" : "member" } });
      await this.prisma.emailToken.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
      return { ok: true, verified: true };
    }
    await this.newHousehold(u.id, b.household || b.name, locale, code);
    await this.sendCheck(u);
    return { ok: true, verified: false };
  }

  /** The household of a new account (owner), with the invitation code's plan ; the code counts one use more, unless
   * the last one went meanwhile (the account is then removed). */
  private async newHousehold(userId: string, name: string, locale: string, code: { id: string; maxUses: number; plan: string | null } | null) {
    if (code) {
      const used = await this.prisma.signupCode.updateMany({ where: { id: code.id, uses: { lt: code.maxUses } }, data: { uses: { increment: 1 } } });
      if (!used.count) { await this.prisma.user.delete({ where: { id: userId } }); throw new AppError(400, "signup.badCode"); }
    }
    return this.prisma.household.create({ data: { name, locale, settings: newHouseholdSettings(locale) as unknown as Prisma.InputJsonValue,
      ...(code ? { signupCodeId: code.id, plan: code.plan ?? "free" } : {}),
      memberships: { create: { userId, role: "owner" } } } });
  }

  // ── « Continue with Google / Microsoft »: sign-in, or sign-up (invitation code or household invitation carried) ──
  /** Consent page of the provider ; the invitation code is checked first (a wrong code does not leave the page). */
  @Public() @Get("auth/social/:provider/start")
  async socialStart(@Param("provider") provider: string, @Query("code") code: string, @Query("invite") invite: string, @Query("locale") locale: string, @Res() res: Response) {
    const p = provider as SocialProvider;
    if (!socialProviders().includes(p)) throw new AppError(404, "auth.socialUnavailable");
    if (code) await this.codeFor(code);
    const n = nonce();   // the answer is accepted only in this browser (no sign-in into someone else's account)
    res.cookie(SOCIAL_COOKIE, n, nonceCookie(config.baseUrl.startsWith("https")));
    const state = encrypt({ p, n, code: code ?? "", invite: invite ?? "", locale: languages.includes(locale) ? locale : config.defaultLocale, exp: Date.now() + 15 * 60e3 });
    res.redirect(socialAuthorizeUrl(p, state));
  }

  @Public() @Get("auth/social/callback")
  async socialCallback(@Query("code") code: string, @Query("state") state: string, @Query("error") error: string, @Req() req: Request, @Res() res: Response) {
    const fail = (reason: string) => res.redirect(`${config.baseUrl}/?${new URLSearchParams({ social: "error", reason })}`);
    const s = decrypt(state ?? "") as { p?: SocialProvider; n?: string; code?: string; invite?: string; locale?: string; exp?: number };
    const cookie = req.signedCookies?.[SOCIAL_COOKIE];
    res.clearCookie(SOCIAL_COOKIE, { path: "/api/v1/" });
    if (!s.p || (s.exp ?? 0) < Date.now()) return fail("expired");
    if (!s.n || cookie !== s.n) return fail("otherBrowser");
    if (error || !code) return fail(error || "cancelled");
    try {
      const id = await socialIdentity(s.p, code);
      if (!id.email || !id.verified) return fail("unverified");
      let u = await this.prisma.user.findUnique({ where: { email: id.email } });
      if (u) {   // an account with this address (checked by the provider): signed in, the address counts as checked
        if (u.disabled) return fail("disabled");
        if (!u.emailVerifiedAt) u = await this.prisma.user.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() } });
      } else {
        const invite = s.invite ? await this.valid("invite", s.invite).catch(() => null) : null;
        if (invite && invite.email !== id.email) return fail("inviteEmail");
        if (!invite && (config.mode !== "hosted" || config.signup === "closed")) return fail("noAccount");
        const signupCode = !invite && config.signup === "code" ? await this.codeFor(s.code).catch(() => null) : null;
        if (!invite && config.signup === "code" && !signupCode) return fail("code");
        if (invite) await this.joinable(invite.householdId!);
        u = await this.auth.createUser({ email: id.email, name: id.name.slice(0, 80), locale: s.locale, verified: true });
        if (invite) {
          await this.prisma.membership.create({ data: { userId: u.id, householdId: invite.householdId!, role: invite.role === "owner" ? "owner" : "member" } });
          await this.prisma.emailToken.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
        } else {
          const h = await this.newHousehold(u.id, id.name.slice(0, 80), s.locale ?? config.defaultLocale, signupCode);
          await this.provisioning.provision(h.id);
        }
      }
      await this.auth.openSession(res, u.id);
      return res.redirect(`${config.baseUrl}/`);
    } catch (e) { return fail((e as { key?: string }).key ?? (e as Error).message.slice(0, 120)); }
  }

  @Public() @Get("auth/verify")
  async verify(@Query("token") token: string, @Res() res: Response) {
    let ok = true;
    try {
      const t = await this.valid("verify", token);
      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: t.userId! }, data: { emailVerifiedAt: new Date() } }),
        this.prisma.emailToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
      ]);
      for (const m of await this.prisma.membership.findMany({ where: { userId: t.userId!, role: "owner" } })) await this.provisioning.provision(m.householdId);
    } catch {
      ok = false;
    }
    res.redirect(`/?${ok ? "verified=1" : "verified=0"}`);
  }

  /** New check e-mail (same answer whether the address has an account or not). */
  // ── Forgotten password: a link by e-mail (valid 1 hour), the same answer whether the address has an account or not ──
  @Public() @Post("auth/password/forgot")
  async forgot(@Body() b: EmailDto) {
    const u = await this.prisma.user.findUnique({ where: { email: b.email.toLowerCase() } });
    if (u && !u.disabled) {
      const raw = await this.token("reset", u.email, 1 / 24, { userId: u.id });
      await this.mail.send(u.email, u.locale, "reset", { name: u.name, link: `${config.baseUrl}/?reset=${raw}` });
    }
    return { ok: true };
  }

  @Public() @Post("auth/password/reset")
  async reset(@Body() b: ResetDto) {
    const t = await this.valid("reset", b.token);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: t.userId! }, data: { passwordHash: await hashPassword(b.password), emailVerifiedAt: new Date(),
        sessionVersion: { increment: 1 } } }),   // a forgotten password ends the sessions still open elsewhere
      this.prisma.emailToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  // ── Helping an account (administration) ──
  /** A link to choose a new password (24 h), for the administrator to give to the person (nothing sent). */
  @Roles("ADMIN") @Post("admin/users/:user/reset-link")
  async resetLink(@Param("user") user: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user } });
    return { link: `${config.baseUrl}/?reset=${await this.token("reset", u.email, 1, { userId: u.id })}` };
  }

  /** The address checked by hand (the person did not get the mail), or the check mail sent again. */
  @Roles("ADMIN") @Post("admin/users/:user/verify")
  async verifyByHand(@Param("user") user: string) {
    await this.prisma.user.update({ where: { id: user }, data: { emailVerifiedAt: new Date() } });
    for (const m of await this.prisma.membership.findMany({ where: { userId: user, role: "owner" } })) await this.provisioning.provision(m.householdId).catch(() => undefined);
    return { ok: true };
  }

  @Roles("ADMIN") @Post("admin/users/:user/verification")
  async resendCheck(@Param("user") user: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user } });
    await this.sendCheck(u);
    return { ok: true };
  }

  /** A test message to the administrator: is the mail of the site working? */
  @Roles("ADMIN") @Post("admin/mail-test")
  async mailTest(@CurrentUser() me: AuthUser) {
    await this.mail.send(me.email, me.locale, "test", { name: me.name, link: config.baseUrl });
    return { ok: true, smtp: !!config.smtpUrl, to: me.email };
  }

  @Public() @Post("auth/verify/resend")
  async resend(@Body() b: EmailDto) {
    const u = await this.prisma.user.findUnique({ where: { email: b.email.toLowerCase() } });
    if (u && !u.emailVerifiedAt) await this.sendCheck(u);
    return { ok: true };
  }

  /** The plan of the household allows one more account (pending invitations count). */
  private async joinable(householdId: string) {
    if (config.mode !== "hosted") return;
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    const accounts = await this.prisma.membership.count({ where: { householdId } });
    if (accounts >= planOf(h).maxAccounts) throw new AppError(409, "plan.maxAccounts");
  }

  @HouseholdAdmin() @Post("households/:id/invites")
  async inviteSend(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: InviteDto) {
    await this.joinable(id);
    const pending = await this.prisma.emailToken.count({ where: { kind: "invite", householdId: id, usedAt: null, expiresAt: { gt: new Date() } } });
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id } });
    if (config.mode === "hosted" && pending + (await this.prisma.membership.count({ where: { householdId: id } })) >= planOf(h).maxAccounts) throw new AppError(409, "plan.maxAccounts");
    const raw = await this.token("invite", b.email, 7, { householdId: id, role: b.role ?? "member" });
    await this.mail.send(b.email, h.locale, "invite", { inviter: me.name, household: h.name, link: `${config.baseUrl}/?invite=${raw}` });
    return { ok: true };
  }
}
