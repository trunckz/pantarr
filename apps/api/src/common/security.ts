// Defence in depth for the web server: which proxies tell the client's address, security headers (helmet, CSP), and
// limits on the routes that can be abused from outside (guessing passwords, sending mails, creating accounts).
import { json, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { BlockList, isIP } from "node:net";
import { config } from "../config";
import { pickLocale, t } from "../i18n/i18n";

// ── Client's address ──
/** Published ranges of Cloudflare (https://www.cloudflare.com/ips/), in front of the hosted instances. */
const CLOUDFLARE = ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20",
  "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"];
const PRIVATE = ["127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "100.64.0.0/10", "::1/128", "fc00::/7", "fe80::/10"];

function blockList(cidrs: string[]): BlockList {
  const b = new BlockList();
  for (const c of cidrs) {
    const [net, bits] = c.split("/");
    b.addSubnet(net, Number(bits), net.includes(":") ? "ipv6" : "ipv4");
  }
  return b;
}
const cloudflare = blockList(CLOUDFLARE), privateNets = blockList(PRIVATE);
const has = (b: BlockList, addr: string) => {
  const a = addr.replace(/^::ffff:/, "");
  const v = isIP(a);
  return v ? b.check(a, v === 6 ? "ipv6" : "ipv4") : false;
};

/** Default « trust proxy »: the proxy the request comes from when its address is private (reverse proxy of the
 * server), then Cloudflare's addresses. A client cannot pass a fake address: it is never a trusted hop itself. */
export function trustProxy(addr: string, hop: number): boolean {
  return (hop === 0 && has(privateNets, addr)) || has(cloudflare, addr);
}

export function trustProxySetting(): boolean | number | string | ((addr: string, hop: number) => boolean) {
  const v = config.trustProxy.trim();
  if (!v) return trustProxy;
  if (v === "true" || v === "false") return v === "true";
  return /^\d+$/.test(v) ? Number(v) : v;
}

// ── Headers ──
/** Strict policy for the web app (its scripts only ; Paddle when it bills) ; the API documentation keeps its own. */
export function securityHeaders() {
  const paddle = config.billing.provider === "paddle" ? ["https://cdn.paddle.com", "https://*.paddle.com"] : [];
  const strict = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...paddle],
        styleSrc: ["'self'", "'unsafe-inline'"],   // Mantine sets inline styles
        imgSrc: ["'self'", "data:", "blob:", "https:"],   // recipe photos of a public Mealie
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", ...paddle],
        frameSrc: ["'self'", ...paddle],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: config.frameAncestors.split(/\s+/).filter(Boolean),
      },
    },
    // the drive sites and the extension call the bridge from their own origin (CORS): resources stay readable there
    crossOriginResourcePolicy: { policy: "cross-origin" },
    strictTransportSecurity: config.baseUrl.startsWith("https") ? { maxAge: 31536000 } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xFrameOptions: false,   // frame-ancestors says it, with the allowed dashboards
  });
  const docs = helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" }, xFrameOptions: false });
  return (req: Request, res: Response, next: NextFunction) => (req.path.startsWith("/api/docs") ? docs : strict)(req, res, next);
}

// ── Limits ──
interface Rule { method: string; path: RegExp; max: number; windowMin: number; by: "ip" | "ip+email"; failuresOnly?: boolean; name: string }

/** Per client address (and per address typed, for what targets one account). */
export const RULES: Rule[] = [
  { name: "login", method: "POST", path: /^\/api\/v1\/auth\/login$/, max: 10, windowMin: 15, by: "ip+email", failuresOnly: true },
  { name: "login-ip", method: "POST", path: /^\/api\/v1\/auth\/login$/, max: 50, windowMin: 15, by: "ip", failuresOnly: true },
  { name: "mail", method: "POST", path: /^\/api\/v1\/auth\/(password\/forgot|verify\/resend)$/, max: 5, windowMin: 60, by: "ip+email" },
  { name: "mail-ip", method: "POST", path: /^\/api\/v1\/auth\/(password\/forgot|verify\/resend)$/, max: 20, windowMin: 60, by: "ip" },
  { name: "signup", method: "POST", path: /^\/api\/v1\/auth\/(signup|password\/reset|setup)$/, max: 10, windowMin: 60, by: "ip" },
  { name: "social", method: "GET", path: /^\/api\/v1\/auth\/(social\/[a-z]+\/start|oidc\/start)$/, max: 30, windowMin: 10, by: "ip" },
  { name: "pair", method: "POST", path: /^\/api\/v1\/extension\/pair$/, max: 10, windowMin: 10, by: "ip", failuresOnly: true },
  { name: "feedback", method: "POST", path: /^\/api\/v1\/feedback$/, max: 5, windowMin: 60, by: "ip" },
  { name: "inbound", method: "POST", path: /^\/api\/v1\/inbound\/mail$/, max: 300, windowMin: 1, by: "ip" },
];

const hits = new Map<string, number[]>();
let sweep = 0;

/** In memory (one server process): enough for one instance ; behind several replicas, each counts its own. */
export function rateLimit(rules: Rule[] = RULES) {
  const parse = json({ limit: "1mb" });   // the address typed is in the body: read it here (the app's parser then skips it)
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.rateLimit || !rules.some((r) => r.method === req.method && r.path.test(req.path))) return next();
    parse(req, res, (err?: unknown) => (err ? next(err) : limit(rules, req, res, next)));
  };
}

function limit(rules: Rule[], req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    if (now - sweep > 60e3) {   // forget the old windows now and then
      sweep = now;
      for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 3600e3) hits.delete(k);
    }
    const applying = rules.filter((r) => r.method === req.method && r.path.test(req.path));
    if (!applying.length) return next();
    const email = String((req.body as { email?: unknown } | undefined)?.email ?? "").toLowerCase().slice(0, 200);
    const keys = applying.map((r) => ({ r, k: `${r.name}|${req.ip}${r.by === "ip+email" ? "|" + email : ""}` }));
    for (const { r, k } of keys) {
      const recent = (hits.get(k) ?? []).filter((at) => now - at < r.windowMin * 60e3);
      hits.set(k, recent);
      if (recent.length >= r.max) {
        res.setHeader("Retry-After", String(Math.ceil((recent[0] + r.windowMin * 60e3 - now) / 1000)));
        res.status(429).json({ statusCode: 429, code: "auth.tooMany", message: t("auth.tooMany", pickLocale(req.headers["accept-language"])) });
        return;
      }
    }
    const count = (failed: boolean) => { for (const { r, k } of keys) if (!r.failuresOnly || failed) hits.get(k)!.push(Date.now()); };
    res.on("finish", () => count(res.statusCode >= 400));
    next();
}
export const resetRateLimits = () => hits.clear();
