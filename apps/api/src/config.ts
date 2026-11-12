// Configuration from the environment (12-factor). Only PANTARR_SECRET and DATABASE_URL are required.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Version of the API package (dist/config.js and src/config.ts both sit one level under apps/api). */
function packageVersion(): string {
  try { return String(JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")).version ?? "0.0.0"); } catch { return "0.0.0"; }
}

export const config = {
  version: packageVersion(),
  /** Where users report bugs and ask for features (a GitHub repository: its issue forms are prefilled) ; « off » hides
   * the links. A fork points it to its own repository. */
  /** GitHub token allowed to open tickets on that repository (fine-grained, « Issues: write » only): with it, the app
   * shows a form instead of the link, for users without a GitHub account. */
  issuesToken: process.env.PANTARR_ISSUES_TOKEN ?? "",
  issuesUrl: process.env.PANTARR_ISSUES_URL === "off" ? "" : (process.env.PANTARR_ISSUES_URL ?? "https://github.com/trunckz/pantarr").replace(/\/$/, ""),
  port: Number(process.env.PORT ?? 9925),
  baseUrl: (process.env.PANTARR_BASE_URL ?? "http://localhost:9925").replace(/\/$/, ""),
  secret: process.env.PANTARR_SECRET ?? "",
  sessionDays: Number(process.env.PANTARR_SESSION_DAYS ?? 30),
  /** Proxies to trust for the client's address (X-Forwarded-For): empty = the proxy in front (private address) and
   * Cloudflare ; else Express's « trust proxy » value (a number of hops, or addresses / subnets separated by commas). */
  trustProxy: process.env.PANTARR_TRUST_PROXY ?? "",
  /** Pages allowed to show Pantarr in a frame (Content-Security-Policy frame-ancestors), e.g. a home dashboard. */
  frameAncestors: process.env.PANTARR_FRAME_ANCESTORS ?? "'self'",
  /** « off » removes the limits on login, sign-up and the like (tests, a closed network). */
  rateLimit: process.env.PANTARR_RATE_LIMIT !== "off",
  adminEmail: process.env.PANTARR_ADMIN_EMAIL ?? "",
  adminPassword: process.env.PANTARR_ADMIN_PASSWORD ?? "",
  defaultLocale: process.env.PANTARR_DEFAULT_LOCALE ?? "en",
  webDist: process.env.PANTARR_WEB_DIST ?? "../web/dist",
  /** Folder of extra connectors (docs/connectors.md), self-hosted only. */
  connectorsDir: process.env.PANTARR_CONNECTORS_DIR ?? "",
  /** « self-hosted » (default) or « hosted » (sign-up, plans and quotas, billing: docs/hosted.md). */
  mode: process.env.PANTARR_MODE === "hosted" ? "hosted" as const : "self-hosted" as const,
  /** Outgoing mail (sign-up check, invitations): smtp://user:password@host:587 ; without it the links are logged. */
  smtpUrl: process.env.PANTARR_SMTP_URL ?? "",
  mailFrom: process.env.PANTARR_MAIL_FROM ?? "Pantarr <no-reply@localhost>",
  /** Hosted sign-up: « open » (anyone), « code » (an invitation code, e.g. a beta), « closed » (invitations only). */
  signup: (["open", "code", "closed"].includes(process.env.PANTARR_SIGNUP ?? "") ? process.env.PANTARR_SIGNUP : "open") as "open" | "code" | "closed",
  hosted: {
    /** Shared Mealie: one group per household, created with an administrator token. */
    mealieUrl: (process.env.PANTARR_MEALIE_URL ?? "").replace(/\/$/, ""),
    mealieAdminToken: process.env.PANTARR_MEALIE_ADMIN_TOKEN ?? "",
    /** LLM of the platform (households without their own key, within the quota of their plan). */
    geminiKey: process.env.PANTARR_PLATFORM_GEMINI_KEY ?? "",
    geminiModel: process.env.PANTARR_PLATFORM_GEMINI_MODEL ?? "gemini-flash-latest",
    /** Plans as JSON (hosted/plans.ts gives the default ones). */
    plans: process.env.PANTARR_PLANS ?? "",
  },
  /** OAuth clients of the instance (« Connect with Google » in one click for every household, no client to create). A
   * household may still type its own client on a self-hosted instance without them. */
  oauth: {
    google: { id: process.env.PANTARR_GOOGLE_CLIENT_ID ?? "", secret: process.env.PANTARR_GOOGLE_CLIENT_SECRET ?? "" },
    microsoft: { id: process.env.PANTARR_MICROSOFT_CLIENT_ID ?? "", secret: process.env.PANTARR_MICROSOFT_CLIENT_SECRET ?? "" },
    todoist: { id: process.env.PANTARR_TODOIST_CLIENT_ID ?? "", secret: process.env.PANTARR_TODOIST_CLIENT_SECRET ?? "" },
  },
  /** Who runs this instance, shown on the public privacy policy and terms pages (required to publish a Google app). */
  legal: {
    operator: process.env.PANTARR_OPERATOR_NAME ?? "",
    contact: process.env.PANTARR_CONTACT_EMAIL ?? "",
    updated: process.env.PANTARR_LEGAL_UPDATED ?? "2026-11-06",
  },
  /** Browser extension: its pages on the stores once published (empty: not published yet). */
  extension: {
    chromeUrl: process.env.PANTARR_EXTENSION_CHROME_URL ?? "",
    firefoxUrl: process.env.PANTARR_EXTENSION_FIREFOX_URL ?? "",
  },
  /** Receipts by forwarded e-mail: each household gets <code>@domain ; the mail service of the domain (Cloudflare Email
   * Routing + worker, deploy/cloudflare/inbound-worker.js) posts the raw mails with the secret. Empty: feature hidden. */
  inbound: {
    domain: (process.env.PANTARR_INBOUND_DOMAIN ?? "").toLowerCase(),
    secret: process.env.PANTARR_INBOUND_SECRET ?? "",
  },
  billing: {
    provider: (process.env.PANTARR_BILLING ?? "") as "" | "paddle" | "stripe",
    webhookSecret: process.env.PANTARR_BILLING_WEBHOOK_SECRET ?? "",
    /** Paddle: client-side token and environment (sandbox | production) for Paddle.js. */
    paddleClientToken: process.env.PANTARR_PADDLE_CLIENT_TOKEN ?? "",
    paddleEnvironment: process.env.PANTARR_PADDLE_ENV ?? "sandbox",
    /** Paddle: server API key, for the customer portal. */
    paddleApiKey: process.env.PANTARR_PADDLE_API_KEY ?? "",
    /** Stripe: secret key, to create the Checkout and portal sessions. */
    stripeSecretKey: process.env.PANTARR_STRIPE_SECRET_KEY ?? "",
  },
};

export function assertConfig(): void {
  if (config.secret.length < 32) throw new Error("PANTARR_SECRET must be set (32 characters or more)");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
}
