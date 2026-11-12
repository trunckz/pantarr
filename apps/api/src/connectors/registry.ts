// Connector registry: built-in connectors and their manifests (admin page lists them). Phase 0: manifests only,
// implementations arrive phase by phase (docs/roadmap.md).
import { Controller, Get, Headers, Injectable } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { ConnectorManifest } from "@pantarr/connector-sdk";
import { config } from "../config";
import { HOSTED_BLOCKED } from "../hosted/safe-fetch";
import { guideFor, oneClickGuide } from "./guides";
import { platformClient } from "./oauth/oauth";
import { gmailConnector } from "./gmail/gmail.connector";


import { caldavConnector, homeAssistantCalendarConnector, icsConnector } from "./calendar/calendar.connectors";
import { paperlessConnector } from "./documents/paperless.connector";
import { intermarcheCart } from "./intermarche/intermarche.cart";
import { storeCarts } from "./stores/stores";
import { mailboxConnector } from "./mailbox/mailbox.connector";
import { lidlPlus } from "./lidl/lidl";
import { intermarchePurchases } from "./intermarche/intermarche.purchases";
import { appleShortcutsConnector, caldavTasksConnector, googleKeepConnector, homeAssistantTodoConnector } from "./lists/lists.connectors";
import { genericReceipts, grocyConnector } from "./generic/generic.connectors";
import { geminiConnector } from "./llm/gemini.connector";
import { openaiConnector } from "./llm/openai.connector";
import { mealieConnector } from "./mealie/mealie.connector";
import { googleCalendarConnector, microsoftCalendarConnector, microsoftTodoConnector, todoistConnector } from "./cloud/cloud.connectors";

export const BUILT_IN: ConnectorManifest[] = [
  mealieConnector.manifest, geminiConnector.manifest, openaiConnector.manifest,
  caldavConnector.manifest, icsConnector.manifest, homeAssistantCalendarConnector.manifest,
  paperlessConnector.manifest, gmailConnector.manifest, mailboxConnector.manifest, lidlPlus.manifest, intermarchePurchases.manifest, intermarcheCart.manifest, ...storeCarts.map((c) => c.manifest),
  googleKeepConnector.manifest, homeAssistantTodoConnector.manifest, caldavTasksConnector.manifest, appleShortcutsConnector.manifest,
  genericReceipts.manifest, grocyConnector.manifest,
  googleCalendarConnector.manifest, microsoftCalendarConnector.manifest, todoistConnector.manifest, microsoftTodoConnector.manifest,
];

const CLIENT_FIELDS = ["clientId", "clientSecret", "tenant"];

/** Hosted instance (people with no technical knowledge): only the connectors set in one click — « Connect with … »
 * through the instance's own app. Addresses, app passwords, tokens and browser scripts stay for self-hosting. */
export function offeredInHosted(m: ConnectorManifest): boolean {
  return !!m.oauth && platformClient(m.oauth) && !HOSTED_BLOCKED.includes(m.id);
}

/** A manifest as the Connectors page shows it: with the instance's own OAuth client, one « Connect » button and no
 * client fields (« platformOAuth »); Todoist without one keeps its personal token. */
export function presentManifest(m: ConnectorManifest, lang: string) {
  if (m.oauth && platformClient(m.oauth)) {
    const settings = Object.fromEntries(Object.entries(m.settings).filter(([k]) => !CLIENT_FIELDS.includes(k))
      .map(([k, f]) => [k, m.oauth === "todoist" && k === "token" ? { ...f, hidden: true, required: false } : f]));
    return { ...m, settings, platformOAuth: true, guide: oneClickGuide(m.id, m.oauth, lang) };
  }
  if (m.oauth === "todoist") return { ...m, oauth: undefined, guide: guideFor(m.id, lang, m.guide) };
  return { ...m, guide: guideFor(m.id, lang, m.guide) };
}

@Injectable()
export class ConnectorRegistry {
  manifests(): ConnectorManifest[] { return config.mode === "hosted" ? BUILT_IN.filter(offeredInHosted) : BUILT_IN; }
}

// Manifests only (no settings, no secrets): every signed-in user, the owners of a household configure its connectors
@ApiTags("connectors")
@Controller("connectors")
export class ConnectorsController {
  constructor(private registry: ConnectorRegistry) {}
  /** Manifests with their help in the interface language, and the OAuth return address to declare at the provider. */
  @Get("available")
  available(@Headers("accept-language") lang = "en") {
    return this.registry.manifests().map((m) => presentManifest(m, lang));
  }
}
