// Accounts: admins manage everyone; each user edits their own name, language and password (/users/me).
import { Body, Controller, Delete, Get, Param, Patch, Post, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { hash } from "@node-rs/argon2";
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import type { Response } from "express";
import { AuthService } from "../auth/auth.service";
import { AuthUser, CurrentUser, Roles } from "../auth/decorators";
import { AppError } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";

class CreateUserDto {
  @IsEmail() email: string; @IsString() name: string;
  @IsOptional() @IsString() @MinLength(10) password?: string;
  @IsOptional() @IsIn(["ADMIN", "USER"]) role?: "ADMIN" | "USER";
  @IsOptional() @IsString() locale?: string;
}
class UpdateUserDto {
  @IsOptional() @IsString() name?: string; @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsIn(["ADMIN", "USER"]) role?: "ADMIN" | "USER"; @IsOptional() @IsBoolean() disabled?: boolean;
  @IsOptional() @IsString() @MinLength(10) password?: string;
}
class UpdateMeDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() locale?: string; @IsOptional() @IsString() @MinLength(10) password?: string }

const PUBLIC_FIELDS = { id: true, email: true, name: true, role: true, locale: true, disabled: true, createdAt: true, lastLoginAt: true, oidcSubject: true } as const;

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private prisma: PrismaService, private auth: AuthService) {}

  /** A new password ends the sessions of the other devices ; this browser stays signed in. */
  @Patch("me")
  async updateMe(@CurrentUser() me: AuthUser, @Body() b: UpdateMeDto, @Res({ passthrough: true }) res: Response) {
    const u = await this.prisma.user.update({ where: { id: me.id }, select: PUBLIC_FIELDS, data: {
      name: b.name, locale: b.locale, ...(b.password ? { passwordHash: await hash(b.password) } : {}) } });
    if (b.password) await this.auth.endSessions(me.id, me.via === "session" ? res : undefined);
    return u;
  }

  @Roles("ADMIN") @Get()
  list() { return this.prisma.user.findMany({ select: PUBLIC_FIELDS, orderBy: { createdAt: "asc" } }); }

  @Roles("ADMIN") @Post()
  async create(@Body() b: CreateUserDto) {
    const u = await this.auth.createUser(b);
    return this.prisma.user.findUnique({ where: { id: u.id }, select: PUBLIC_FIELDS });
  }

  @Roles("ADMIN") @Patch(":id")
  async update(@Param("id") id: string, @Body() b: UpdateUserDto) {
    if (b.role === "USER" || b.disabled) await this.keepOneAdmin(id);
    const u = await this.prisma.user.update({ where: { id }, select: PUBLIC_FIELDS, data: {
      name: b.name, locale: b.locale, role: b.role, disabled: b.disabled,
      ...(b.password ? { passwordHash: await hash(b.password) } : {}) } });
    if (b.password || b.role === "USER") await this.auth.endSessions(id);   // set by an administrator: the person signs in again
    return u;
  }

  @Roles("ADMIN") @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.keepOneAdmin(id);
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  private async keepOneAdmin(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (u?.role === "ADMIN" && (await this.prisma.user.count({ where: { role: "ADMIN", disabled: false } })) <= 1) {
      throw new AppError(409, "users.lastAdmin");
    }
  }
}
