// Personal API keys for other apps and the browser bridge: shown once, stored as an argon2 hash.
import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { hash } from "@node-rs/argon2";
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, IsISO8601 } from "class-validator";
import { randomBytes } from "node:crypto";
import { AuthUser, CurrentUser } from "../auth/decorators";
import { AppError } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";

export const SCOPES = ["read", "write", "admin", "bridge"] as const;
class CreateKeyDto {
  @IsString() name: string;
  @IsArray() @ArrayNotEmpty() @IsIn(SCOPES, { each: true }) scopes: string[];
  @IsOptional() @IsISO8601() expiresAt?: string;
}

@ApiTags("api-keys")
@Controller("api-keys")
export class ApiKeysController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() me: AuthUser) {
    return this.prisma.apiKey.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" },
      select: { id: true, name: true, prefix: true, scopes: true, createdAt: true, lastUsedAt: true, expiresAt: true } });
  }

  @Post()
  async create(@CurrentUser() me: AuthUser, @Body() b: CreateKeyDto) {
    const scopes = me.role === "ADMIN" ? b.scopes : b.scopes.filter((s) => s !== "admin");
    const key = "ptr_" + randomBytes(24).toString("base64url");
    const k = await this.prisma.apiKey.create({ data: {
      name: b.name, prefix: key.slice(0, 12), hash: await hash(key), scopes, userId: me.id,
      expiresAt: b.expiresAt ? new Date(b.expiresAt) : null } });
    return { id: k.id, name: k.name, prefix: k.prefix, scopes, key };   // the full key is never shown again
  }

  @Delete(":id")
  async remove(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    const r = await this.prisma.apiKey.deleteMany({ where: { id, userId: me.id } });
    if (!r.count) throw new AppError(404, "apiKeys.notFound");
    return { ok: true };
  }
}
