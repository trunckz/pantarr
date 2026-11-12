// Sign-in with Google, Microsoft or Todoist for the connectors that need it (Google Calendar, Gmail, Outlook calendar,
// Microsoft To Do, Todoist). With the instance's own OAuth clients (PANTARR_GOOGLE_CLIENT_ID…, always so on a hosted
// instance), the household only clicks « Connect » and accepts; without them (self-hosted), the household's admin
// creates a client at the provider (the Help button explains how) and types its ID and secret. The provider sends
// back a code to /api/v1/oauth/callback, exchanged for a refresh token (Todoist: a lasting token) kept encrypted with
// the connector. Access tokens are asked again when they expire (cached in memory).
import type { ConnectorContext } from "@pantarr/connector-sdk";
import { config } from "../../config";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "../../common/crypto";

export type Provider = "google" | "microsoft" | "todoist";

export const redirectUri = () => `${config.baseUrl}/api/v1/oauth/callback`;

/** Whether the instance has its own client for this provider (one-click connection). */
export const platformClient = (p: Provider) => !!config.oauth[p].id && !!config.oauth[p].secret;

/** Client used: the household's own when it typed one, else the instance's. */
export function client(p: Provider, s: Record<string, unknown>): { id: string; secret: string; own: boolean } {
  if (s.clientId) return { id: String(s.clientId), secret: String(s.clientSecret ?? ""), own: true };
  return { id: config.oauth[p].id, secret: config.oauth[p].secret, own: false };
}

const tenant = (s: Record<string, unknown>) => encodeURIComponent(String((s.clientId && s.tenant) || "common"));
const endpoints = (p: Provider, s: Record<string, unknown>) => p === "google"
  ? { authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", revoke: "https://oauth2.googleapis.com/revoke" }
  : p === "todoist"
    ? { authorize: "https://todoist.com/oauth/authorize", token: "https://todoist.com/oauth/access_token", revoke: "" }
    : { authorize: `https://login.microsoftonline.com/${tenant(s)}/oauth2/v2.0/authorize`, token: `https://login.microsoftonline.com/${tenant(s)}/oauth2/v2.0/token`, revoke: "" };

/** Scopes asked per connector: read-only where Pantarr only reads; « openid email » to show which account is connected. */
export const SCOPES: Record<string, string> = {
  "google-calendar": "openid email https://www.googleapis.com/auth/calendar.readonly",
  gmail: "openid email https://www.googleapis.com/auth/gmail.readonly",
  "microsoft-calendar": "openid email offline_access Calendars.Read",
  "microsoft-todo": "openid email offline_access Tasks.ReadWrite",
  todoist: "data:read_write",
};

/** Cookie (signed, httpOnly) holding the nonce of a connection started in this browser: the provider's answer is
 * accepted only in the browser, and the session, that asked for it (a consent link sent to someone else is useless). */
export const OAUTH_COOKIE = "pantarr_oauth";
export const SOCIAL_COOKIE = "pantarr_social";
export const nonce = () => randomBytes(18).toString("base64url");
export const nonceCookie = (secure: boolean) => ({ httpOnly: true, sameSite: "lax" as const, signed: true, secure, maxAge: 15 * 60e3, path: "/api/v1/" });

/** Opaque, encrypted and short-lived « state »: which household and connector the answer belongs to, who asked, and
 * the nonce also kept in the browser's cookie. */
export const makeState = (householdId: string, moduleId: string, userId = "", n = "") =>
  encrypt({ h: householdId, m: moduleId, u: userId, n, exp: Date.now() + 15 * 60e3 });
export function readState(state: string): { h: string; m: string; u: string; n: string } | null {
  const v = decrypt(state) as { h?: string; m?: string; u?: string; n?: string; exp?: number };
  return v.h && v.m && (v.exp ?? 0) > Date.now() ? { h: v.h, m: v.m, u: v.u ?? "", n: v.n ?? "" } : null;
}

/** Address of the provider's consent page. */
export function authorizeUrl(p: Provider, moduleId: string, settings: Record<string, unknown>, state: string): string {
  const c = client(p, settings);
  const q = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri(), response_type: "code", scope: SCOPES[moduleId] ?? "", state,
    ...(p === "google" ? { access_type: "offline", prompt: "consent" } : p === "microsoft" ? { prompt: "select_account" } : {}) });
  return `${endpoints(p, settings).authorize}?${q}`;
}

interface TokenAnswer { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; error?: string; error_description?: string }

async function tokenCall(p: Provider, settings: Record<string, unknown>, body: Record<string, string>, f: typeof fetch): Promise<TokenAnswer> {
  const c = client(p, settings);
  const r = await f(endpoints(p, settings).token, { method: "POST", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: c.id, ...(c.secret ? { client_secret: c.secret } : {}), ...body }) });
  const j = await r.json().catch(() => ({})) as TokenAnswer;
  if (!r.ok || j.error) throw new Error(`${p === "google" ? "Google" : p === "todoist" ? "Todoist" : "Microsoft"}: ${j.error_description ?? j.error ?? r.status}`);
  return j;
}

/** Address of the account, from the ID token given by the token endpoint itself (no signature to check: TLS answer). */
export function accountOf(idToken?: string): string {
  try {
    const claims = JSON.parse(Buffer.from(String(idToken).split(".")[1], "base64url").toString("utf8")) as { email?: string; preferred_username?: string };
    return claims.email ?? claims.preferred_username ?? "";
  } catch { return ""; }
}

/** Code of the consent page → the secrets to keep (refresh token, or Todoist's lasting token) and the account. */
export async function exchangeCode(p: Provider, moduleId: string, settings: Record<string, unknown>, code: string, f: typeof fetch = fetch):
  Promise<{ secrets: Record<string, string>; account: string }> {
  const j = await tokenCall(p, settings, { grant_type: "authorization_code", code, redirect_uri: redirectUri(), ...(p === "microsoft" ? { scope: SCOPES[moduleId] } : {}) }, f);
  if (p === "todoist") {
    if (!j.access_token) throw new Error("Todoist gave no token");
    return { secrets: { token: j.access_token }, account: "" };
  }
  if (!j.refresh_token) throw new Error(p === "google" ? "Google gave no refresh token: remove Pantarr from your account's third-party access, then connect again"
    : "Microsoft gave no refresh token (offline_access missing)");
  return { secrets: { refreshToken: j.refresh_token }, account: accountOf(j.id_token) };
}

/** Disconnection: the provider forgets the access when it can (Google), Pantarr forgets the token in any case. */
export async function revoke(p: Provider, settings: Record<string, unknown>, f: typeof fetch = fetch): Promise<void> {
  const url = endpoints(p, settings).revoke, token = String(settings.refreshToken ?? "");
  if (!url || !token) return;
  await f(`${url}?${new URLSearchParams({ token })}`, { method: "POST", signal: AbortSignal.timeout(10000) }).catch(() => undefined);
}

const cache = new Map<string, { token: string; until: number }>();

/** A valid access token for the connector ; a refresh token rotated by the provider is stored again. */
export async function accessToken(ctx: ConnectorContext, p: Provider, moduleId: string): Promise<string> {
  const refresh = String(ctx.settings.refreshToken ?? "");
  if (!refresh) throw new Error("not connected yet: use « Connect » on the connector");
  const hit = cache.get(refresh);
  if (hit && hit.until > Date.now() + 60e3) return hit.token;
  const j = await tokenCall(p, ctx.settings, { grant_type: "refresh_token", refresh_token: refresh, ...(p === "microsoft" ? { scope: SCOPES[moduleId] } : {}) }, ctx.fetch);
  if (!j.access_token) throw new Error("no access token");
  const until = Date.now() + (j.expires_in ?? 3600) * 1000;
  if (j.refresh_token && j.refresh_token !== refresh) {
    await ctx.saveSecrets?.({ refreshToken: j.refresh_token });
    cache.set(j.refresh_token, { token: j.access_token, until });
  } else cache.set(refresh, { token: j.access_token, until });
  return j.access_token;
}

/** JSON call to the provider's API with the access token. */
export async function apiCall<T>(ctx: ConnectorContext, p: Provider, moduleId: string, url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken(ctx, p, moduleId);
  const r = await ctx.fetch(url, { ...init, signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) } });
  if (!r.ok) throw new Error(`${new URL(url).host}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (r.status === 204 ? null : await r.json()) as T;
}

// ── Sign-in / sign-up with Google or Microsoft (instance clients only): who the person is, nothing else ──
export type SocialProvider = "google" | "microsoft";
export const socialRedirect = () => `${config.baseUrl}/api/v1/auth/social/callback`;
export const socialProviders = (): SocialProvider[] => (["google", "microsoft"] as const).filter((p) => platformClient(p));

/** Consent page asking only the identity (openid email profile: no verification needed at Google). */
export function socialAuthorizeUrl(p: SocialProvider, state: string): string {
  const q = new URLSearchParams({ client_id: config.oauth[p].id, redirect_uri: socialRedirect(), response_type: "code", scope: "openid email profile", state,
    prompt: "select_account" });
  return `${endpoints(p, {}).authorize}?${q}`;
}

export interface Identity { subject: string; email: string; name: string; verified: boolean }

/** Tenant of the personal Microsoft accounts (outlook.com, hotmail…): their address is the account, owned by the person. */
export const MICROSOFT_CONSUMERS = "9188040d-6c67-4c5b-b112-36a304b66dad";

/** Claims of an ID token received from the token endpoint itself (TLS answer: no signature to check).
 * Google says in « email_verified » whether the address is checked. Microsoft does not: in a work or school directory
 * anyone with admin rights can give a user any address (« nOAuth »). Its address is trusted only for a personal account
 * (consumers tenant) or when « xms_edov » says the domain owner verified it (optional claim of the app registration) ;
 * the person is identified by tenant + object id, never by the address. */
export function identityOf(p: SocialProvider, idToken: string): Identity {
  const c = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as
    { sub?: string; oid?: string; tid?: string; email?: string; email_verified?: boolean | string; xms_edov?: boolean | string | number;
      preferred_username?: string; name?: string };
  if (p === "microsoft") {
    const email = String(c.email ?? "").toLowerCase();
    const edov = c.xms_edov === true || c.xms_edov === "true" || c.xms_edov === 1 || c.xms_edov === "1";
    return { subject: `microsoft:${c.tid ?? ""}:${c.oid ?? c.sub ?? ""}`, email, name: c.name || email.split("@")[0],
      verified: /@/.test(email) && (c.tid === MICROSOFT_CONSUMERS || edov) };
  }
  const email = String(c.email ?? "").toLowerCase();
  return { subject: `${p}:${c.sub ?? ""}`, email, name: c.name || email.split("@")[0], verified: c.email_verified === true || c.email_verified === "true" };
}

/** Code of the consent page → identity of the person. */
export async function socialIdentity(p: SocialProvider, code: string, f: typeof fetch = fetch): Promise<Identity> {
  const r = await f(endpoints(p, {}).token, { method: "POST", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: config.oauth[p].id, client_secret: config.oauth[p].secret, grant_type: "authorization_code", code, redirect_uri: socialRedirect(),
      ...(p === "microsoft" ? { scope: "openid email profile" } : {}) }) });
  const j = await r.json().catch(() => ({})) as TokenAnswer;
  if (!r.ok || !j.id_token) throw new Error(j.error_description ?? j.error ?? `${r.status}`);
  return identityOf(p, j.id_token);
}
