// Enabled connectors of a household: settings in clear, secret fields (manifest « secret: true ») encrypted.
import { storeCarts } from "./stores/stores";
import { mailboxConnector } from "./mailbox/mailbox.connector";
import { gmailConnector } from "./gmail/gmail.connector";
import { lidlPlus } from "./lidl/lidl";
import { googleCalendarConnector, microsoftCalendarConnector, microsoftTodoConnector, todoistConnector } from "./cloud/cloud.connectors";
import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import type { ConnectorContext, ConnectorManifest } from "@pantarr/connector-sdk";
import { Prisma } from "@prisma/client";
import { decrypt, encrypt } from "../common/crypto";
import { config } from "../config";
import { HOSTED_BLOCKED, safeFetch } from "../hosted/safe-fetch";
import { AppError } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";
import { caldavConnector, homeAssistantCalendarConnector, icsConnector } from "./calendar/calendar.connectors";
import { paperlessConnector } from "./documents/paperless.connector";
import { intermarcheCart } from "./intermarche/intermarche.cart";
import { intermarchePurchases } from "./intermarche/intermarche.purchases";
import { appleShortcutsConnector, caldavTasksConnector, googleKeepConnector, homeAssistantTodoConnector } from "./lists/lists.connectors";
import { genericReceipts, grocyConnector } from "./generic/generic.connectors";
import { geminiConnector } from "./llm/gemini.connector";
import { openaiConnector } from "./llm/openai.connector";
import { mealieConnector } from "./mealie/mealie.connector";
import { BUILT_IN } from "./registry";

export const MASK = "********";
/** Implemented connectors (the others are announced in the registry). */
export const IMPLEMENTED = {
  mealie: mealieConnector, gemini: geminiConnector, openai: openaiConnector,
  ics: icsConnector, caldav: caldavConnector, "home-assistant": homeAssistantCalendarConnector,
  paperless: paperlessConnector, "intermarche-purchases": intermarchePurchases, "intermarche-cart": intermarcheCart,
  "google-keep": googleKeepConnector, "home-assistant-todo": homeAssistantTodoConnector, "caldav-tasks": caldavTasksConnector,
  "apple-shortcuts": appleShortcutsConnector, "generic-receipts": genericReceipts, grocy: grocyConnector,
  ...Object.fromEntries(storeCarts.map((c) => [c.manifest.id, c])),
  mailbox: mailboxConnector, gmail: gmailConnector, "lidl-plus": lidlPlus,
  "google-calendar": googleCalendarConnector, "microsoft-calendar": microsoftCalendarConnector, "microsoft-todo": microsoftTodoConnector, todoist: todoistConnector,
};

/** Household of a connector instance, or null for the instance-wide one (manifest « scope: instance »). */
export type Owner = string | null;

@Injectable()
export class ConnectorsService implements OnApplicationBootstrap {
  private log = new Logger("connectors");
  constructor(private prisma: PrismaService) {}

  /** Whether a connector is one for the whole instance (Mealie, LLM, document manager). */
  instanceWide(moduleId: string): boolean {
    try { return this.manifest(moduleId).scope === "instance"; } catch { return false; }
  }

  /** Self-hosted: households use the instance's connector unless they have their own row (hosted: the platform
   * provisions per household: Mealie group, own LLM key). */
  private async row(householdId: Owner, moduleId: string, enabledOnly = false) {
    const own = await this.prisma.connectorInstance.findFirst({ where: { householdId, moduleId } });
    if (own || householdId === null || config.mode === "hosted" || !this.instanceWide(moduleId)) return own && (!enabledOnly || own.enabled) ? own : null;
    const shared = await this.prisma.connectorInstance.findFirst({ where: { householdId: null, moduleId } });
    return shared && (!enabledOnly || shared.enabled) ? shared : null;
  }

  /** Self-hosted, once: the instance-wide connectors set on the only household so far become the instance's. */
  /** Hosted: the platform's Mealie set in the administration replaces the environment's (households are provisioned
   * with it from now on ; existing ones keep their group). */
  async applyPlatform() {
    if (config.mode !== "hosted") return;
    const m = await this.prisma.connectorInstance.findFirst({ where: { householdId: null, moduleId: "mealie", enabled: true } });
    if (!m) return;
    const s = { ...(m.settings as Record<string, unknown>), ...decrypt(m.secrets) };
    if (s.url && s.token) Object.assign(config.hosted, { mealieUrl: String(s.url).replace(/\/$/, ""), mealieAdminToken: String(s.token) });
  }

  async onApplicationBootstrap() {
    if (config.mode === "hosted") { await this.applyPlatform().catch((e) => this.log.warn(`platform: ${(e as Error).message}`)); return; }
    try {
      if ((await this.prisma.household.count()) !== 1) return;
      for (const m of BUILT_IN.filter((x) => x.scope === "instance")) {
        if (await this.prisma.connectorInstance.findFirst({ where: { householdId: null, moduleId: m.id } })) continue;
        const rows = await this.prisma.connectorInstance.findMany({ where: { moduleId: m.id, householdId: { not: null } } });
        if (rows.length !== 1) continue;
        await this.prisma.connectorInstance.update({ where: { id: rows[0].id }, data: { householdId: null } });
        this.log.log(`${m.id}: now set for the whole instance (was on the only household)`);
      }
    } catch (e) { this.log.warn(`instance connectors: ${(e as Error).message}`); }
  }

  manifest(moduleId: string): ConnectorManifest {
    const m = (IMPLEMENTED as Record<string, { manifest: ConnectorManifest }>)[moduleId]?.manifest ?? BUILT_IN.find((x) => x.id === moduleId);
    if (!m) throw new AppError(404, "connectors.unknown");
    return m;
  }

  /** Settings as shown to the admin: secrets masked. */
  async read(householdId: Owner, moduleId: string) {
    const i = await this.prisma.connectorInstance.findFirst({ where: { householdId, moduleId } });
    if (!i) return { enabled: false, settings: {} as Record<string, unknown> };
    const s = { ...(i.settings as Record<string, unknown>) };
    for (const k of Object.keys(decrypt(i.secrets))) s[k] = MASK;
    return { enabled: i.enabled, settings: s };
  }

  async write(householdId: Owner, moduleId: string, enabled: boolean, values: Record<string, unknown>) {
    const m = this.manifest(moduleId);
    if (config.mode === "hosted" && HOSTED_BLOCKED.includes(moduleId)) throw new AppError(403, "hosted.blocked");
    const old = await this.prisma.connectorInstance.findFirst({ where: { householdId, moduleId } });
    const secrets = decrypt(old?.secrets), settings: Record<string, unknown> = {};
    if (old && (old.settings as Record<string, unknown>).account) settings.account = (old.settings as Record<string, unknown>).account;   // set by « Connect »
    for (const [k, f] of Object.entries(m.settings)) {
      if (!(k in values) || f.hidden) continue;   // hidden: set by Pantarr itself (refresh token of « Connect »)
      if (f.secret) { if (values[k] !== MASK) secrets[k] = values[k]; } else settings[k] = values[k];
    }
    const data = { enabled, settings: settings as Prisma.InputJsonValue, secrets: encrypt(secrets), kind: m.kind };
    if (old) await this.prisma.connectorInstance.update({ where: { id: old.id }, data });
    else await this.prisma.connectorInstance.create({ data: { ...data, householdId, moduleId } });
    return this.read(householdId, moduleId);
  }

  /** Context for a call: settings + decrypted secrets ; null when the connector is not enabled. */
  async context(householdId: Owner, moduleId: string, locale = "en"): Promise<ConnectorContext | null> {
    const i = await this.row(householdId, moduleId, true);
    if (!i || (config.mode === "hosted" && HOSTED_BLOCKED.includes(moduleId))) return null;
    return { settings: { ...(i.settings as Record<string, unknown>), ...decrypt(i.secrets) }, locale,
             // the instance's own connectors are set by its administrators (trusted: the platform's Mealie is internal)
             log: (m) => this.log.log(`${moduleId}: ${m}`), fetch: config.mode === "hosted" && i.householdId !== null ? safeFetch : fetch,
             saveSecrets: (values) => this.saveSecrets(i.householdId, moduleId, values) };
  }

  /** Settings and secrets of the instance, enabled or not (OAuth needs the client before the connector works). */
  async rawSettings(householdId: Owner, moduleId: string): Promise<Record<string, unknown>> {
    const i = await this.prisma.connectorInstance.findFirst({ where: { householdId, moduleId } });
    return i ? { ...(i.settings as Record<string, unknown>), ...decrypt(i.secrets) } : {};
  }

  /** Adds or replaces secret values (other settings untouched) ; the instance is created disabled if missing. */
  async saveSecrets(householdId: Owner, moduleId: string, values: Record<string, unknown>) {
    const m = this.manifest(moduleId);
    const old = await this.prisma.connectorInstance.findFirst({ where: { householdId, moduleId } });
    const secrets = encrypt({ ...decrypt(old?.secrets), ...values });
    if (old) await this.prisma.connectorInstance.update({ where: { id: old.id }, data: { secrets } });
    else await this.prisma.connectorInstance.create({ data: { householdId, moduleId, kind: m.kind, enabled: false, settings: {}, secrets } });
  }

  /** After « Connect »: the tokens kept, the account shown, the connector enabled (one click, nothing else to do). */
  async connected(householdId: string, moduleId: string, secrets: Record<string, unknown>, account: string) {
    await this.saveSecrets(householdId, moduleId, secrets);
    const i = await this.prisma.connectorInstance.findFirstOrThrow({ where: { householdId, moduleId } });
    await this.prisma.connectorInstance.update({ where: { id: i.id }, data: { enabled: true,
      settings: { ...(i.settings as Record<string, unknown>), account } as Prisma.InputJsonValue } });
  }

  /** « Disconnect »: tokens forgotten, connector disabled (the other settings are kept). */
  async disconnected(householdId: string, moduleId: string) {
    const i = await this.prisma.connectorInstance.findFirst({ where: { householdId, moduleId } });
    if (!i) return;
    const secrets = decrypt(i.secrets);
    delete secrets.refreshToken; delete secrets.cursor;
    if (this.manifest(moduleId).oauth === "todoist") delete secrets.token;
    const settings = { ...(i.settings as Record<string, unknown>) }; delete settings.account;
    await this.prisma.connectorInstance.update({ where: { id: i.id }, data: { enabled: false, secrets: encrypt(secrets), settings: settings as Prisma.InputJsonValue } });
  }

  /** Enabled connectors of a household of a kind: its own, and the instance's ones it does not override. */
  async enabledOf(householdId: string, kind: string): Promise<string[]> {
    const rows = await this.prisma.connectorInstance.findMany({ where: { kind, OR: [{ householdId }, ...(config.mode === "hosted" ? [] : [{ householdId: null }])] } });
    const own = new Set(rows.filter((r) => r.householdId === householdId).map((r) => r.moduleId));
    return [...new Set(rows.filter((r) => r.enabled && (r.householdId === householdId || !own.has(r.moduleId))).map((r) => r.moduleId))];
  }

  async require(householdId: string, moduleId: string, locale?: string): Promise<ConnectorContext> {
    const c = await this.context(householdId, moduleId, locale);
    if (!c) throw new AppError(409, "connectors.notConfigured");
    return c;
  }
}
