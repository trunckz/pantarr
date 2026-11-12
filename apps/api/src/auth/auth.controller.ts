import { plans } from "../hosted/plans";
import { Body, Controller, Get, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import type { Request, Response } from "express";
import { feedbackFormEnabled } from "../feedback/feedback";
import { config } from "../config";
import { AppError, languages } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";
import { SESSION_COOKIE } from "./auth.guard";
import { AuthService } from "./auth.service";
import { AuthUser, CurrentUser, Public } from "./decorators";
import { OidcService } from "./oidc.service";
import { SettingsService } from "../settings/settings.service";
import { socialProviders } from "../connectors/oauth/oauth";

class LoginDto { @IsEmail() email: string; @IsString() password: string }
class SetupDto {
  @IsEmail() email: string; @IsString() name: string; @IsString() @MinLength(10) password: string;
  @IsOptional() @IsString() locale?: string;
}
const OIDC_COOKIE = "pantarr_oidc";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService, private oidc: OidcService, private prisma: PrismaService, private settings: SettingsService) {}

  /** What the login page needs: first start, SSO button, local login allowed, languages. */
  @Public() @Get("status")
  async status() {
    const o = await this.oidc.options();
    // a message of the administrators shown to everyone (maintenance, news)
    const announcement = String(((await this.settings.get("general")) as { announcement?: string } | null)?.announcement ?? "").trim();
    return { version: config.version, issuesUrl: config.issuesUrl, feedbackForm: feedbackFormEnabled(), announcement, setupNeeded: await this.auth.setupNeeded(), oidc: o.enabled ? { label: o.buttonLabel } : null,
             localLogin: !o.enabled || o.localLogin, languages, mode: config.mode, signup: config.mode === "hosted" && config.signup !== "closed",
             signupMode: config.mode === "hosted" ? config.signup : "closed",
             billing: config.mode === "hosted" && !!config.billing.provider, social: socialProviders(),
             legal: { ...config.legal, baseUrl: config.baseUrl, hosted: config.mode === "hosted", inboundDomain: config.inbound.domain },
             // the plans shown on the public home page (hosted)
             plans: config.mode === "hosted" ? plans().map((p) => ({ code: p.code, name: p.name, price: p.price, maxAccounts: p.maxAccounts, llmMonthlyCalls: p.llmMonthlyCalls })) : [] };
  }

  /** First start: creates the administrator (only when there is no account yet). */
  @Public() @Post("setup")
  async setup(@Body() b: SetupDto, @Res({ passthrough: true }) res: Response) {
    if (!(await this.auth.setupNeeded())) throw new AppError(409, "setup.done");
    const u = await this.auth.createUser({ ...b, role: "ADMIN" });
    await this.auth.openSession(res, u.id);
    return { ok: true };
  }

  @Public() @Post("login")
  async login(@Body() b: LoginDto, @Res({ passthrough: true }) res: Response) {
    const o = await this.oidc.options();
    if (o.enabled && !o.localLogin) throw new AppError(403, "auth.localDisabled");
    const u = await this.auth.login(b.email, b.password);
    await this.auth.openSession(res, u.id);
    return { ok: true };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  /** Ends the sessions of this account on every device, this one included. */
  @Post("logout-everywhere")
  async logoutEverywhere(@CurrentUser() me: AuthUser, @Res({ passthrough: true }) res: Response) {
    if (me.via !== "session") throw new AppError(403, "auth.forbidden");
    await this.auth.endSessions(me.id);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  /** The connected user; « owner » when they manage at least one household (settings of their households). */
  @Get("me")
  async me(@CurrentUser() u: AuthUser) {
    return { ...u, owner: !!(await this.prisma.membership.findFirst({ where: { userId: u.id, role: "owner" } })) };
  }

  @Public() @Get("oidc/start")
  async oidcStart(@Res() res: Response) {
    if (!(await this.oidc.options()).enabled) throw new AppError(404, "auth.oidcNotConfigured");
    const { url, transaction } = await this.oidc.start();
    res.cookie(OIDC_COOKIE, JSON.stringify(transaction), { httpOnly: true, sameSite: "lax", signed: true, maxAge: 600e3, path: "/" });
    res.redirect(url);
  }

  @Public() @Get("oidc/callback")
  async oidcCallback(@Req() req: Request, @Res() res: Response, @Query() q: Record<string, string>) {
    const tx = req.signedCookies?.[OIDC_COOKIE];
    if (!tx) throw new AppError(400, "auth.oidcNotConfigured");
    res.clearCookie(OIDC_COOKIE, { path: "/" });
    const id = await this.oidc.callback(q, JSON.parse(tx));
    let u = await this.prisma.user.findUnique({ where: { oidcSubject: id.subject } })
      ?? await this.prisma.user.findUnique({ where: { email: id.email.toLowerCase() } });
    if (!u) u = await this.auth.createUser({ email: id.email, name: id.name, role: id.admin ? "ADMIN" : "USER", locale: id.locale, oidcSubject: id.subject });
    else u = await this.prisma.user.update({ where: { id: u.id }, data: { oidcSubject: id.subject, ...(id.admin ? { role: "ADMIN" } : {}) } });
    if (u.disabled) throw new AppError(403, "auth.disabled");
    await this.auth.openSession(res, u.id);
    res.redirect(config.baseUrl + "/");
  }
}
