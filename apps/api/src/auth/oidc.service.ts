// Single sign-on (OIDC, authorization code + PKCE): Authentik, Keycloak, Authelia, Zitadel… Settings stored in the
// « oidc » setting (admin page) ; accounts created at first login, admin role from a group claim.
import { Injectable } from "@nestjs/common";
import { generators, Issuer, type Client } from "openid-client";
import { config } from "../config";
import { SettingsService } from "../settings/settings.service";

export interface OidcSettings {
  enabled: boolean; issuer: string; clientId: string; clientSecret: string; scopes: string;
  groupsClaim: string; adminGroup: string; buttonLabel: string; localLogin: boolean;
}
export const OIDC_DEFAULTS: OidcSettings = {
  enabled: false, issuer: "", clientId: "", clientSecret: "", scopes: "openid profile email groups",
  groupsClaim: "groups", adminGroup: "", buttonLabel: "SSO", localLogin: true,
};

@Injectable()
export class OidcService {
  private cache: { key: string; client: Client } | null = null;
  constructor(private settings: SettingsService) {}

  async options(): Promise<OidcSettings> {
    // hosted: no single sign-on of an organisation (people sign in with their e-mail, Google or Microsoft)
    if (config.mode === "hosted") return { ...OIDC_DEFAULTS, enabled: false } as OidcSettings;
    return { ...OIDC_DEFAULTS, ...((await this.settings.get("oidc")) as Partial<OidcSettings> | null ?? {}) };
  }

  redirectUri() { return `${config.baseUrl}/api/v1/auth/oidc/callback`; }

  private async client(o: OidcSettings): Promise<Client> {
    const key = `${o.issuer}|${o.clientId}|${o.clientSecret}`;
    if (this.cache?.key === key) return this.cache.client;
    const issuer = await Issuer.discover(o.issuer);
    const client = new issuer.Client({ client_id: o.clientId, client_secret: o.clientSecret, redirect_uris: [this.redirectUri()], response_types: ["code"] });
    this.cache = { key, client };
    return client;
  }

  async start() {
    const o = await this.options();
    const c = await this.client(o);
    const state = generators.state(), nonce = generators.nonce(), verifier = generators.codeVerifier();
    const url = c.authorizationUrl({ scope: o.scopes, state, nonce, code_challenge: generators.codeChallenge(verifier), code_challenge_method: "S256" });
    return { url, transaction: { state, nonce, verifier } };
  }

  async callback(params: Record<string, string>, tx: { state: string; nonce: string; verifier: string }) {
    const o = await this.options();
    const c = await this.client(o);
    const tokens = await c.callback(this.redirectUri(), params, { state: tx.state, nonce: tx.nonce, code_verifier: tx.verifier });
    const claims = { ...tokens.claims(), ...(await c.userinfo(tokens).catch(() => ({}))) } as Record<string, unknown>;
    const groups = claims[o.groupsClaim];
    return {
      subject: String(claims.sub),
      email: String(claims.email ?? `${claims.sub}@oidc.local`),
      name: String(claims.name ?? claims.preferred_username ?? claims.email ?? "User"),
      admin: !!o.adminGroup && Array.isArray(groups) && groups.map(String).includes(o.adminGroup),
      locale: typeof claims.locale === "string" ? claims.locale.slice(0, 2) : undefined,
    };
  }
}
