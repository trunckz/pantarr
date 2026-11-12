// LLM calls of a household (menus, changes, shopping list): the enabled LLM connector, or the platform's key in hosted
// mode, within the monthly quota ; every call is metered (tokens, purpose).
import { Injectable } from "@nestjs/common";
import type { ConnectorContext, LlmConnector, LlmFile } from "@pantarr/connector-sdk";
import { config } from "../config";
import { ConnectorsService, IMPLEMENTED } from "../connectors/connectors.service";
import { geminiConnector } from "../connectors/llm/gemini.connector";
import { planOf } from "../hosted/plans";
import { settingsOf } from "../households/households.defaults";
import { AppError } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

const LLM_MODULES = ["gemini", "openai"];

@Injectable()
export class LlmService {
  constructor(private prisma: PrismaService, private connectors: ConnectorsService, private settings: SettingsService) {}

  async usage(householdId: string) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
    const rows = await this.prisma.llmUsage.aggregate({ where: { householdId, at: { gte: month } }, _count: true, _sum: { inputTokens: true, outputTokens: true } });
    const general = ((await this.settings.get("general")) as { llmMonthlyCalls?: number | null } | null) ?? {};
    let limit = settingsOf(h).llmMonthlyCalls ?? general.llmMonthlyCalls ?? null;
    // Hosted: the platform's LLM within the quota of the plan, unless the household brings its own key
    const own = await this.prisma.connectorInstance.count({ where: { householdId, kind: "llm", enabled: true } });
    if (config.mode === "hosted" && !own) limit = h.quotaOverride ?? planOf(h).llmMonthlyCalls;   // a platform admin's gesture wins
    return { since: month.toISOString().slice(0, 10), calls: rows._count, inputTokens: rows._sum.inputTokens ?? 0, outputTokens: rows._sum.outputTokens ?? 0, limit,
      plan: config.mode === "hosted" ? planOf(h).code : null };
  }

  /** JSON answer of the model ; purpose: propose | change | shopping | receipt. */
  async complete(householdId: string, locale: string, purpose: string, prompt: string, files?: LlmFile[]): Promise<unknown> {
    const u = await this.usage(householdId);
    if (u.limit !== null && u.calls >= u.limit) throw new AppError(429, "llm.quota");
    for (const m of LLM_MODULES) {
      const ctx = await this.connectors.context(householdId, m, locale);
      if (!ctx) continue;
      return this.metered(householdId, m, purpose, () => (IMPLEMENTED as unknown as Record<string, LlmConnector>)[m].complete(ctx, { prompt, files }));
    }
    if (config.mode === "hosted") {   // the platform's LLM set in the administration
      for (const m of LLM_MODULES) {
        const ctx = await this.connectors.context(null, m, locale);
        if (ctx) return this.metered(householdId, "platform", purpose, () => (IMPLEMENTED as unknown as Record<string, LlmConnector>)[m].complete(ctx, { prompt, files }));
      }
    }
    if (config.mode === "hosted" && config.hosted.geminiKey) {   // else the platform's key of the environment
      const ctx: ConnectorContext = { settings: { apiKey: config.hosted.geminiKey, model: config.hosted.geminiModel }, locale, fetch, log: () => undefined };
      return this.metered(householdId, "platform", purpose, () => geminiConnector.complete(ctx, { prompt, files }));
    }
    throw new AppError(409, "llm.notConfigured");
  }

  private async metered(householdId: string, connector: string, purpose: string,
                        call: () => Promise<{ json: unknown; usage: { model: string; inputTokens: number; outputTokens: number } }>) {
    try {
      const r = await call();
      await this.prisma.llmUsage.create({ data: { householdId, connector, purpose, model: r.usage.model, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens } });
      return r.json;
    } catch (e) {
      await this.prisma.llmUsage.create({ data: { householdId, connector, purpose, model: "?", ok: false } });
      throw e;
    }
  }
}
