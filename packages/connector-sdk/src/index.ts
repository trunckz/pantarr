// Pantarr connector SDK: the contracts between the core and the connectors (recipes backend, LLM, calendar,
// store purchases, store cart, shared list, inventory). See docs/connectors.md.

export type ConnectorKind = "recipes" | "llm" | "calendar" | "documents" | "purchases" | "cart" | "list-sync" | "inventory";

/** One setting of a connector, rendered by the admin settings page. */
export interface SettingField {
  type: "string" | "number" | "boolean" | "url";
  title: string;
  description?: string;
  secret?: boolean;
  required?: boolean;
  default?: string | number | boolean;
  /** Filled by Pantarr itself (e.g. the refresh token of « Connect »): not shown in the form. */
  hidden?: boolean;
}

/** Step-by-step help shown by the Help button of a connector (one per language). */
export interface ConnectorGuide { intro?: string; steps: string[]; links?: { label: string; url: string }[] }

export interface ConnectorManifest {
  id: string;
  kind: ConnectorKind;
  name: string;
  description?: string;
  /** ISO country codes where the store exists (store connectors). */
  countries?: string[];
  settings: Record<string, SettingField>;
  /** Needs the browser bridge (userscript running on the store site). */
  bridge?: boolean;
  /** Store sites allowed to call the bridge routes (CORS), e.g. https://www.intermarche.com */
  origins?: string[];
  /** Home page of the store site (« Send to the online store » opens it). */
  siteUrl?: string;
  /** Not implemented yet: listed so the admin sees what is coming. */
  planned?: boolean;
  /** Sign-in with the provider (« Connect » button): Pantarr keeps the refresh token in the hidden secret « refreshToken ». */
  oauth?: "google" | "microsoft" | "todoist";
  /** « instance »: one for the whole instance, set by its administrators (Mealie, the LLM, the document manager), used
   * by every household ; otherwise each household has its own (calendars, mail, lists, stores). */
  scope?: "instance" | "household";
  /** Help per language (« fr », « en »…): a plugin brings its own, the built-in ones are in the core. */
  guide?: Record<string, ConnectorGuide>;
}

/** Given to every call: the settings of the enabled instance, a logger and a fetch with timeouts. */
export interface ConnectorContext {
  settings: Record<string, unknown>;
  locale: string;
  log: (message: string) => void;
  fetch: typeof fetch;
  /** Stores new secret values of the instance (e.g. a rotated refresh token). */
  saveSecrets?: (values: Record<string, unknown>) => Promise<void>;
}

// ── Domain types shared with the core ──
export interface Purchase {
  date: string;                // ISO date
  label: string;               // as printed on the receipt / invoice
  brand?: string;
  quantity: number;
  unitPrice?: number;
  store?: string;
  channel: "online" | "in-store";
  externalId?: string;         // receipt / order id, for deduplication
}

export interface ListItem { id: string; text: string; checked: boolean }
export interface CalendarEvent { start: string; end: string; allDay: boolean; title: string; calendar: string }
export interface StockLevel { product: string; quantity: number; unit?: string; /** below or at it: to buy (Grocy « min. stock amount ») */ minimum?: number }

export interface CartRequestItem {
  text: string;                // article of the shopping list
  quantity: number;
  habitual?: string;           // product most recently bought for this article
  preferred?: string;          // product imposed by the household
}

export interface RecipeSummary { id: string; slug: string; name: string; url: string; /** total time, when the recipe gives one */ minutes?: number | null; servings?: number | null }
export interface MealPlanEntry { date: string; meal: "breakfast" | "lunch" | "dinner" | "snack"; title?: string; recipeId?: string; note?: string }
export interface ShoppingItem { id?: string; note: string; checked: boolean; label?: string; extras?: Record<string, string> }

// ── Interfaces per kind ──
export interface RecipesConnector {
  manifest: ConnectorManifest & { kind: "recipes" };
  listRecipes(ctx: ConnectorContext): Promise<RecipeSummary[]>;
  listMealPlan(ctx: ConnectorContext, from: string, to: string): Promise<MealPlanEntry[]>;
  writeMealPlan(ctx: ConnectorContext, entries: MealPlanEntry[]): Promise<void>;
  listShoppingItems(ctx: ConnectorContext): Promise<ShoppingItem[]>;
  upsertShoppingItems(ctx: ConnectorContext, items: ShoppingItem[]): Promise<void>;
}

export interface LlmUsage { model: string; inputTokens: number; outputTokens: number }
/** A file given to the model with the prompt (photo of a receipt, PDF invoice), base64. */
export interface LlmFile { mimeType: string; data: string; name?: string }
export interface LlmRequest { prompt: string; files?: LlmFile[] }
export interface LlmConnector {
  manifest: ConnectorManifest & { kind: "llm" };
  /** Returns the parsed JSON answer and the tokens used. Implementations retry transient errors themselves. */
  complete(ctx: ConnectorContext, request: LlmRequest): Promise<{ json: unknown; usage: LlmUsage }>;
  test?(ctx: ConnectorContext): Promise<string>;
}

export interface CalendarConnector {
  manifest: ConnectorManifest & { kind: "calendar" };
  /** Events overlapping [from, to) (ISO dates), recurring events expanded. */
  events(ctx: ConnectorContext, from: string, to: string): Promise<CalendarEvent[]>;
  test?(ctx: ConnectorContext): Promise<string>;
}

/** Document management (optional, recommended): receipts and invoices already archived there (Paperless-ngx API)
 * feed the purchase history, hence the pantry estimate and the habitual products. */
export interface ArchivedDocument { id: string; title: string; created: string; correspondent?: string; type?: string; content: string; filename?: string }
export interface DocumentsConnector {
  manifest: ConnectorManifest & { kind: "documents" };
  /** Purchase documents (receipts, invoices) of the given stores created since a date, with their text. */
  purchaseDocuments(ctx: ConnectorContext, query: { stores: string[]; since?: string }): Promise<ArchivedDocument[]>;
  /** Optional: archive a document received by a store connector (in-store receipt PDF from the bridge). */
  upload?(ctx: ConnectorContext, file: { filename: string; data: Buffer; title?: string }): Promise<void>;
}

export interface PurchasesConnector {
  manifest: ConnectorManifest & { kind: "purchases" };
  /** Server-side import (e-mails, store API without bot protection). */
  import?(ctx: ConnectorContext, since?: string): Promise<Purchase[]>;
  /** Store-specific part of the browser bridge userscript (uploads receipts). */
  bridgeScript?(ctx: ConnectorContext): string;
  /** Turns a document (bridge upload, or text of an archived document from the documents connector) into purchases. */
  parse?(ctx: ConnectorContext, raw: { contentType: string; text: string }): Purchase[];
}

export interface CartConnector {
  manifest: ConnectorManifest & { kind: "cart" };
  /** Userscript of the browser bridge for this store (search, add to basket), configured for one user. */
  bridgeScript(config: { api: string; key: string; version: string }): string;
}

/** Shared list (optional): items added over there (voice assistants…) reach the shopping list, the checked state
 * follows the side that changed since the last sync. Inbound-only connectors (Apple Shortcuts) have no pull. */
export interface ListSyncConnector {
  manifest: ConnectorManifest & { kind: "list-sync" };
  pull?(ctx: ConnectorContext): Promise<ListItem[]>;
  setChecked?(ctx: ConnectorContext, changes: { id: string; checked: boolean }[]): Promise<void>;
  test?(ctx: ConnectorContext): Promise<string>;
}

export interface InventoryConnector {
  manifest: ConnectorManifest & { kind: "inventory" };
  stock(ctx: ConnectorContext): Promise<StockLevel[]>;
}

export type Connector = RecipesConnector | LlmConnector | CalendarConnector | DocumentsConnector | PurchasesConnector | CartConnector
  | ListSyncConnector | InventoryConnector;

/** Manifest-only entry for connectors that are announced but not implemented yet. */
export interface PlannedConnector { manifest: ConnectorManifest & { planned: true } }

export const defineConnector = <T extends Connector | PlannedConnector>(c: T): T => c;
