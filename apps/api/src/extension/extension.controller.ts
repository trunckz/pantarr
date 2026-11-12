// Browser extension: a short code shown in Pantarr connects it to the account and the household (a « bridge » key is
// made for it, revocable in My account) ; the archive to publish on the browser stores, for the administrators.
import { createHash, randomBytes } from "node:crypto";
import { Body, Controller, Get, Header, Param, Post, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { hash } from "@node-rs/argon2";
import { IsString, MaxLength } from "class-validator";
import type { Response } from "express";
import { AuthUser, CurrentUser, Public, Roles } from "../auth/decorators";
import { householdAccess } from "../common/access";
import { config } from "../config";
import { AppError } from "../i18n/i18n";
import { IMPLEMENTED } from "../connectors/connectors.service";
import { PrismaService } from "../prisma/prisma.service";
import { EXTENSION_VERSION, extensionFiles, zip } from "./extension";

class PairDto { @IsString() @MaxLength(20) code: string }

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

@ApiTags("extension")
@Controller()
export class ExtensionController {
  constructor(private prisma: PrismaService) {}

  /** A code valid 10 minutes, to type in the extension (it connects it to this account and household). */
  @Post("households/:id/extension/code")
  async code(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    await householdAccess(this.prisma, me, id);
    const code = Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");
    await this.prisma.emailToken.create({ data: { kind: "extension", hash: sha(code), email: me.email, userId: me.id, householdId: id, expiresAt: new Date(Date.now() + 10 * 60e3) } });
    return { code: `${code.slice(0, 4)}-${code.slice(4)}`, minutes: 10 };
  }

  /** Called by the extension with the code: its bridge key, the household, the API address. */
  @Public() @Post("extension/pair")
  async pair(@Body() b: PairDto) {
    const t = await this.prisma.emailToken.findUnique({ where: { hash: sha(clean(b.code)) } });
    if (!t || t.kind !== "extension" || t.usedAt || t.expiresAt < new Date() || !t.userId || !t.householdId) throw new AppError(400, "extension.badCode");
    const used = await this.prisma.emailToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
    if (!used.count) throw new AppError(400, "extension.badCode");
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: t.householdId } });
    const key = "ptr_" + randomBytes(24).toString("base64url");
    await this.prisma.apiKey.create({ data: { name: "Extension du navigateur", prefix: key.slice(0, 12), hash: await hash(key), scopes: ["bridge"], userId: t.userId } });
    return { api: `${config.baseUrl}/api/v1`, key, household: h.id, householdName: h.name };
  }

  /** Where to install it (store pages once published), and its version. */
  @Get("extension")
  info() {
    const stores = Object.values(IMPLEMENTED as unknown as Record<string, { manifest: { id: string; name: string; kind: string; bridge?: boolean; siteUrl?: string }; bridgeScript?: unknown }>)
      .filter((c) => c.manifest.bridge && typeof c.bridgeScript === "function").map((c) => ({ id: c.manifest.id, name: c.manifest.name, kind: c.manifest.kind, siteUrl: c.manifest.siteUrl ?? null }));
    return { version: EXTENSION_VERSION, chrome: config.extension.chromeUrl || null, firefox: config.extension.firefoxUrl || null, stores };
  }

  /** The archive to publish (Chrome Web Store, Firefox Add-ons) or to load by hand for a test. */
  @Roles("ADMIN") @Get("extension/pantarr-extension.zip") @Header("Content-Type", "application/zip")
  @Header("Content-Disposition", `attachment; filename="pantarr-extension-${EXTENSION_VERSION}.zip"`)
  download(@Res() res: Response) {
    res.send(zip(extensionFiles()));
  }
}
