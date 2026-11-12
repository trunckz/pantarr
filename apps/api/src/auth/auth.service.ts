import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import type { Response } from "express";
import { config } from "../config";
import { AppError } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";
import { SESSION_COOKIE } from "./auth.guard";

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private log = new Logger("auth");
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  /** First admin from PANTARR_ADMIN_EMAIL / PANTARR_ADMIN_PASSWORD when the database has no user. */
  async onApplicationBootstrap() {
    if (!config.adminEmail || !config.adminPassword || (await this.prisma.user.count())) return;
    await this.createUser({ email: config.adminEmail, name: "Admin", password: config.adminPassword, role: "ADMIN" });
    this.log.log(`administrator ${config.adminEmail} created from the environment`);
  }

  setupNeeded() { return this.prisma.user.count().then((n) => n === 0); }

  /** Accounts made by an administrator, the setup or the SSO are trusted; a sign-up waits for its address check. */
  async createUser(u: { email: string; name: string; password?: string; role?: "ADMIN" | "USER"; locale?: string; oidcSubject?: string; verified?: boolean }) {
    if (await this.prisma.user.findUnique({ where: { email: u.email.toLowerCase() } })) throw new AppError(409, "users.emailTaken");
    return this.prisma.user.create({ data: {
      email: u.email.toLowerCase(), name: u.name, role: u.role ?? "USER", locale: u.locale ?? config.defaultLocale,
      passwordHash: u.password ? await hash(u.password) : null, oidcSubject: u.oidcSubject, emailVerifiedAt: u.verified === false ? null : new Date(),
    } });
  }

  private dummy?: Promise<string>;

  async login(email: string, password: string) {
    const u = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // the same work whether the account exists or not: the answer time does not tell which addresses have an account
    this.dummy ??= hash("pantarr-no-such-account");
    const ok = await verify(u?.passwordHash ?? await this.dummy, password).catch(() => false);
    if (!u?.passwordHash || !ok) throw new AppError(401, "auth.invalid");
    if (u.disabled) throw new AppError(403, "auth.disabled");
    if (config.mode === "hosted" && !u.emailVerifiedAt) throw new AppError(403, "auth.unverified");
    return u;
  }

  async openSession(res: Response, userId: string) {
    const u = await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    const token = await this.jwt.signAsync({ sub: userId, v: u.sessionVersion }, { expiresIn: `${config.sessionDays}d` });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "lax", secure: config.baseUrl.startsWith("https"), maxAge: config.sessionDays * 864e5, path: "/",
    });
  }

  /** Ends every open session of the account (all devices) ; « res »: this browser gets a new session at once. */
  async endSessions(userId: string, res?: Response) {
    await this.prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    if (res) await this.openSession(res, userId);
  }
}
