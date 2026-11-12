// Connectors of the whole instance (manifest « scope: instance »: Mealie, the LLM, the document manager), set by the
// administrators and used by every household that has none of its own. Self-hosted instances; on a hosted one the
// platform provides them (Mealie group per household, LLM from the environment).
import { Body, Controller, Get, Headers, Param, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsObject } from "class-validator";
import type { ConnectorContext } from "@pantarr/connector-sdk";
import { Roles } from "../auth/decorators";
import { config } from "../config";
import { ConnectorsService, IMPLEMENTED } from "../connectors/connectors.service";
import { BUILT_IN, presentManifest } from "../connectors/registry";
import { AppError } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";

const PLATFORM = ["mealie", "gemini", "openai"];

class InstanceConnectorDto { @IsBoolean() enabled: boolean; @IsObject() settings: Record<string, unknown> }

@ApiTags("admin")
@Roles("ADMIN")
@Controller("admin/connectors")
export class AdminConnectorsController {
  constructor(private connectors: ConnectorsService, private prisma: PrismaService) {}

  /** Hosted: the platform's Mealie (a group per household is made in it) and LLM ; no document manager there. */
  private check(module: string) {
    if (!this.connectors.instanceWide(module) || (config.mode === "hosted" && !PLATFORM.includes(module))) throw new AppError(404, "connectors.unknown");
  }

  /** Manifests of the instance's connectors (hosted: the platform's Mealie and LLM). */
  @Get("manifests")
  manifests(@Headers("accept-language") lang = "en") {
    return BUILT_IN.filter((m) => m.scope === "instance" && (config.mode !== "hosted" || PLATFORM.includes(m.id))).map((m) => presentManifest(m, lang));
  }

  /** State of the instance's connectors, and the households that still have their own. */
  @Get()
  async states() {
    const rows = await this.prisma.connectorInstance.findMany({ where: { kind: { in: ["recipes", "llm", "documents"] } }, include: { household: { select: { name: true } } } });
    const out: Record<string, { enabled: boolean; households: string[]; server?: boolean }> = {};
    for (const r of rows.filter((x) => this.connectors.instanceWide(x.moduleId))) {
      const o = (out[r.moduleId] ??= { enabled: false, households: [] });
      if (r.householdId === null) o.enabled = r.enabled;
      else if (config.mode !== "hosted") o.households.push(r.household?.name ?? "?");   // hosted: each household's group, normal
    }
    if (config.mode === "hosted") {   // what the server's environment provides when nothing is set here
      if (!out.mealie?.enabled && config.hosted.mealieUrl) (out.mealie ??= { enabled: false, households: [] }).server = true;
      if (!out.gemini?.enabled && !out.openai?.enabled && config.hosted.geminiKey) (out.gemini ??= { enabled: false, households: [] }).server = true;
    }
    return out;
  }

  @Get(":module")
  read(@Param("module") module: string) { this.check(module); return this.connectors.read(null, module); }

  @Put(":module")
  async write(@Param("module") module: string, @Body() b: InstanceConnectorDto) {
    this.check(module);
    const r = await this.connectors.write(null, module, b.enabled, b.settings);
    await this.connectors.applyPlatform();
    return r;
  }

  @Post(":module/test")
  async test(@Param("module") module: string) {
    this.check(module);
    const c = (IMPLEMENTED as Record<string, { test?: (ctx: ConnectorContext) => Promise<unknown> }>)[module];
    if (!c?.test) throw new AppError(404, "connectors.unknown");
    try {
      const ctx = await this.connectors.context(null, module);
      if (!ctx) throw new AppError(409, "connectors.notConfigured");
      const r = await c.test(ctx);
      return { ok: true, ...(typeof r === "string" ? { message: r } : (r as object)) };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }
}
