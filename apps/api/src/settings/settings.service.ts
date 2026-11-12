import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Global key/value settings (OIDC, general). Household settings live on the household row. */
@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}
  async get(key: string): Promise<unknown> {
    return (await this.prisma.setting.findUnique({ where: { key } }))?.value ?? null;
  }
  async set(key: string, value: unknown): Promise<void> {
    const v = value as Prisma.InputJsonValue;
    await this.prisma.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
  }
}
