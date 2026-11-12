// Global guard: session cookie (web) or « Authorization: Bearer ptr_… » API key (other apps, browser bridge).
// API keys: GET needs the « read » scope, other methods « write », admin routes « admin » (and an admin owner).
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { verify } from "@node-rs/argon2";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { AppError } from "../i18n/i18n";
import { AuthUser, HOUSEHOLD_ADMIN, PUBLIC, ROLES } from "./decorators";
import { noteAdminAccess } from "../common/access";

export const SESSION_COOKIE = "pantarr_session";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!req.path.startsWith("/api/")) return true;   // web app (static files)
    const user = await this.identify(req);
    if (user) req.user = user;
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    if (!user) throw new AppError(401, "auth.required");
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES, targets);
    if (roles?.length && !roles.includes(user.role)) throw new AppError(403, "auth.forbidden");
    // Household settings: administrators, and the owners of the household
    if (this.reflector.getAllAndOverride<boolean>(HOUSEHOLD_ADMIN, targets) && user.role !== "ADMIN") {
      const householdId = String((req.params as Record<string, string>)?.id ?? "");
      const m = await this.prisma.membership.findUnique({ where: { userId_householdId: { userId: user.id, householdId } } });
      if (m?.role !== "owner") throw new AppError(403, "auth.forbidden");
    } else if (this.reflector.getAllAndOverride<boolean>(HOUSEHOLD_ADMIN, targets) && (req.params as Record<string, string>)?.id) {
      await noteAdminAccess(this.prisma, user, String((req.params as Record<string, string>).id), `settings ${req.method} ${req.path}`);
    }
    if (user.via === "api-key") {
      // Bridge routes need the « bridge » scope ; a bridge key reaches nothing else
      const bridge = req.path.startsWith("/api/v1/bridge/");
      if (bridge !== user.scopes.includes("bridge") && !(bridge && user.scopes.includes("write"))) throw new AppError(403, "auth.forbidden");
      if (bridge) return true;
      const householdAdmin = this.reflector.getAllAndOverride<boolean>(HOUSEHOLD_ADMIN, targets);
      const needed = roles?.includes("ADMIN") || householdAdmin ? "admin" : req.method === "GET" ? "read" : "write";
      if (!user.scopes.includes(needed) && !(needed === "read" && user.scopes.includes("write"))) throw new AppError(403, "auth.forbidden");
    }
    return true;
  }

  private async identify(req: Request): Promise<AuthUser | null> {
    const header = req.headers.authorization ?? "";
    if (header.startsWith("Bearer ptr_")) return this.fromApiKey(header.slice(7));
    // The userscript download link carries the bridge key (?k=), only on the bridge routes
    const k = typeof req.query?.k === "string" ? req.query.k : "";
    if (k.startsWith("ptr_") && req.path.startsWith("/api/v1/bridge/")) return this.fromApiKey(k);
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return null;
    try {
      const { sub, v } = await this.jwt.verifyAsync<{ sub: string; v?: number }>(token);
      const u = await this.prisma.user.findUnique({ where: { id: sub } });
      if (!u || u.disabled || (v ?? 0) !== u.sessionVersion) return null;   // ended (password changed, signed out everywhere)
      return { id: u.id, email: u.email, name: u.name, role: u.role, locale: u.locale, via: "session", scopes: ["read", "write", "admin"] };
    } catch {
      return null;
    }
  }

  private async fromApiKey(key: string): Promise<AuthUser | null> {
    const k = await this.prisma.apiKey.findUnique({ where: { prefix: key.slice(0, 12) }, include: { user: true } });
    if (!k || k.user.disabled || (k.expiresAt && k.expiresAt < new Date()) || !(await verify(k.hash, key))) return null;
    await this.prisma.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } });
    const u = k.user;
    return { id: u.id, email: u.email, name: u.name, role: u.role, locale: u.locale, via: "api-key", scopes: k.scopes };
  }
}
