// « Connect with Google / Microsoft / Todoist »: the consent page of the provider, then its answer (code) turned into
// tokens kept encrypted with the connector of the household, which is enabled at once. « Disconnect » forgets them.
import { Controller, Delete, Get, Param, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { config } from "../../config";
import { AuthUser, CurrentUser, HouseholdAdmin, Public } from "../../auth/decorators";
import { AppError } from "../../i18n/i18n";
import { PrismaService } from "../../prisma/prisma.service";
import { ConnectorsService } from "../connectors.service";
import { authorizeUrl, exchangeCode, makeState, nonce, nonceCookie, OAUTH_COOKIE, platformClient, readState, redirectUri, revoke } from "./oauth";

@ApiTags("connectors")
@Controller()
export class OauthController {
  constructor(private connectors: ConnectorsService, private prisma: PrismaService) {}

  /** Address of the consent page (instance client, or the household's own saved first) and the address to declare ;
   * the browser keeps a nonce (cookie) that the answer must bring back. */
  @HouseholdAdmin() @Get("households/:id/connectors/:module/oauth")
  async start(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("module") module: string, @Res({ passthrough: true }) res: Response) {
    const m = this.connectors.manifest(module);
    if (!m.oauth) throw new AppError(404, "connectors.unknown");
    const settings = await this.connectors.rawSettings(id, module);
    if (!settings.clientId && !platformClient(m.oauth)) throw new AppError(409, "connectors.oauthClientMissing");
    const n = nonce();
    res.cookie(OAUTH_COOKIE, n, nonceCookie(config.baseUrl.startsWith("https")));
    return { url: authorizeUrl(m.oauth, module, settings, makeState(id, module, me.id, n)), redirectUri: redirectUri() };
  }

  /** The answer belongs to this browser and to a session still allowed to manage the household's connectors. */
  private async sameRequester(req: Request & { user?: AuthUser }, s: { h: string; u: string; n: string }): Promise<boolean> {
    const cookie = req.signedCookies?.[OAUTH_COOKIE];
    const me = req.user;
    if (!s.n || !s.u || cookie !== s.n || !me || me.via !== "session" || me.id !== s.u) return false;
    if (me.role === "ADMIN") return true;
    const m = await this.prisma.membership.findUnique({ where: { userId_householdId: { userId: me.id, householdId: s.h } } });
    return m?.role === "owner";
  }

  @HouseholdAdmin() @Delete("households/:id/connectors/:module/oauth")
  async disconnect(@Param("id") id: string, @Param("module") module: string) {
    const m = this.connectors.manifest(module);
    if (!m.oauth) throw new AppError(404, "connectors.unknown");
    await revoke(m.oauth, await this.connectors.rawSettings(id, module));
    await this.connectors.disconnected(id, module);
    return { ok: true };
  }

  /** Answer of the provider: back to the Connectors page, connected or with the reason. */
  @Public() @Get("oauth/callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Query("error") error: string, @Query("error_description") why: string,
                 @Req() req: Request & { user?: AuthUser }, @Res() res: Response) {
    const s = readState(state ?? "");
    res.clearCookie(OAUTH_COOKIE, { path: "/api/v1/" });
    // back to the Settings tab the connector feeds (calendars → meals, stores → shopping, receipts → stock)
    const kind = s ? (() => { try { return this.connectors.manifest(s.m).kind; } catch { return ""; } })() : "";
    const tab = kind === "calendar" ? "meals" : kind === "cart" || kind === "list-sync" ? "shopping" : kind ? "stock" : "meals";
    const back = (q: Record<string, string>) => res.redirect(`${config.baseUrl}/settings/${tab}?${new URLSearchParams(q)}`);
    if (!s) return back({ oauth: "error", reason: "expired" });
    if (!(await this.sameRequester(req, s))) return back({ oauth: "error", module: s.m, reason: "otherBrowser" });
    if (error || !code) return back({ oauth: "error", module: s.m, reason: why || error || "no code" });
    try {
      const m = this.connectors.manifest(s.m);
      const r = await exchangeCode(m.oauth!, s.m, await this.connectors.rawSettings(s.h, s.m), code);
      await this.connectors.connected(s.h, s.m, r.secrets, r.account);
      return back({ oauth: "ok", module: s.m });
    } catch (e) { return back({ oauth: "error", module: s.m, reason: (e as Error).message.slice(0, 200) }); }
  }
}
