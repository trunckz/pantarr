import { recipeOrigins } from "./recipes/recipe-sites";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import { IMPLEMENTED } from "./connectors/connectors.service";
import { config } from "./config";
import { rateLimit, securityHeaders, trustProxySetting } from "./common/security";

/** Middleware and pipes shared by the server and the end-to-end tests. */
export function configureApp(app: NestExpressApplication): void {
  app.set("trust proxy", trustProxySetting());
  app.use(securityHeaders());
  app.use(cookieParser(config.secret));
  app.use(bridgeCors);
  app.use(rateLimit());
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
}

/** CORS for the browser bridge: only the sites of the store connectors (and of recipes, to import them), only on /api/v1/bridge/. */
export function bridgeCors(req: Request, res: Response, next: NextFunction) {
  const origin = String(req.headers.origin ?? "");
  // the store sites on every bridge route ; the recipe sites only for importing recipes
  const recipes = req.path.startsWith("/api/v1/bridge/recipes/") && recipeOrigins().includes(origin);
  if (req.path.startsWith("/api/v1/bridge/") && (allowedOrigin(origin) || recipes)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
  }
  next();
}
/** An origin of a store site; « https://*.leclercdrive.fr » allows every subdomain (one per drive). */
export function allowedOrigin(origin: string): boolean {
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(origin)) return false;
  return BRIDGE_ORIGINS().some((o) => o === origin || (o.includes("*.") && origin.endsWith(o.slice(o.indexOf("*.") + 1)) && origin.startsWith(o.slice(0, o.indexOf("*.")))));
}
const BRIDGE_ORIGINS = () => Object.values(IMPLEMENTED as unknown as Record<string, { manifest: { origins?: string[] } }>).flatMap((c) => c.manifest.origins ?? []);
