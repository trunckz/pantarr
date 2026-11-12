# Writing a connector

A connector is a class implementing one of the interfaces of `@pantarr/connector-sdk`, plus a manifest. The core never
imports a store or a service directly: it asks the `ConnectorRegistry` for the enabled instance of a kind.

```ts
import { definePurchasesConnector } from "@pantarr/connector-sdk";

export default definePurchasesConnector({
  manifest: {
    id: "intermarche",
    kind: "purchases",
    name: "Intermarché",
    countries: ["FR"],
    settings: {                      // JSON schema rendered by the admin settings page
      mailbox: { type: "string", title: "IMAP mailbox with the invoice e-mails", secret: false },
    },
    bridge: true,                    // needs the browser userscript for in-store receipts
  },
  async import(ctx, since) {
    // return normalised purchases: { date, label, brand?, quantity, unitPrice?, store, source: "online" | "in-store" }
    return [];
  },
});
```

## Kinds

| Kind | Must implement |
|---|---|
| `recipes` | `listRecipes`, `getRecipe`, `listMealPlan`, `writeMealPlan`, `listShoppingList`, `upsertShoppingItems`, `labels` |
| `llm` | `complete({ prompt, schema, model }) → object` (JSON) |
| `calendar` | `events(from, to) → { start, end, title, calendar }[]` |
| `purchases` | `import(ctx, since) → Purchase[]` and/or a bridge handler receiving receipts from the userscript |
| `cart` | `bridgeScript(ctx)` (userscript part for the store site) and `prepare(items) → CartPlan` (search terms, habitual products, preferences) |
| `list-sync` | `pull() → ListItem[]`, `setChecked(changes)` (both optional: Apple Shortcuts is inbound only) — the two-way sync itself (links, which side changed, aisle of new items) is in the core (`list-sync/`) |
| `inventory` | `stock() → StockLevel[]`, `consume(product, quantity)` |

## Rules for store connectors

- Never bypass bot protection (Cloudflare, Akamai, DataDome…). If the site only works from the customer's browser,
  use the **browser bridge**: the connector provides the store-specific part of the userscript; Pantarr wraps it with
  the API key, the panel UI and the habitual-product matching.
- Keep slot booking and payment manual.
- Store abbreviations in receipts (`S.HACHE`, `CCHES`…) belong in the connector's normaliser, not in the core.

## Shared lists (phase 6)

| Connector | How | Notes |
|---|---|---|
| `home-assistant-todo` | REST `todo.get_items` / `todo.update_item` with a long-lived token | any to-do entity: local shopping list, Bring!, OurGroceries…; Assist voice commands add to it |
| `caldav-tasks` | VTODO of one task list (REPORT, then GET / PUT with `If-Match`) | Nextcloud Tasks, Thunderbird, Fastmail. Apple Reminders left CalDAV (iOS 13): use the Shortcut instead |
| `google-keep` | the optional `pantarr-keep` companion (Python, gkeepapi, master token), `docker compose --profile keep` | Keep has no public API; the token stays encrypted in Pantarr and is sent to the companion on the internal network |
| `apple-shortcuts` | inbound only: `POST /api/v1/bridge/list/add` `{ "text": "milk and eggs" }` with a « bridge » key | My account → Voice assistants gives the address, the key and the Shortcut steps; also Tasker, HTTP Shortcuts… |

Sync every 10 minutes and when the shopping page opens: new unchecked items over there are added (aisle from the pantry
families, then from the word lists of the language), the checked state follows the side that changed, an item that
left the list is checked over there, an item deleted over there leaves the list unless already bought.

## Inventory and other stores (phase 7)

- `grocy` (inventory): Grocy's stock wins over the estimate on the Pantry page — a family with stock is « ok », at or
  below the Grocy minimum it is « to buy » (products matched to families by the family keywords).
- `generic-receipts` (purchases): any store whose receipts are archived in the document manager (Leclerc, Carrefour,
  Lidl, a market…): one article per « label … price » line until the total, « n x price » lines giving the quantity.
  A store-specific connector reads better (abbreviations, online invoices): write one when a store matters.

## Writing a connector (plugin)

Self-hosted instances load extra connectors from the folder named by `PANTARR_CONNECTORS_DIR` (mount it into the
container, e.g. `./connectors:/connectors` with `PANTARR_CONNECTORS_DIR=/connectors`). Each `.js` file or folder
exports one connector or a list (`module.exports = { connectors: [...] }`, or a default export), written against the
interfaces of `packages/connector-sdk/src/index.ts`:

1. a **manifest**: `id` (unique), `kind`, `name`, `description`, `settings` (rendered on the Connectors page; fields
   with `secret: true` are stored encrypted and never shown again), `origins` for a cart connector (CORS of the bridge);
2. the methods of its kind (`parse` for purchases, `pull` / `setChecked` for a shared list, `stock` for an inventory,
   `events` for a calendar…), each receiving a `ctx` with `settings` (secrets decrypted), `fetch`, `log`, `locale`;
3. optionally `test(ctx)` → a short message, for the « Test » button.

A plugin may replace a *planned* connector of the same id (Todoist, Microsoft To Do…), never a built-in one. Plugins
run with the rights of Pantarr: install only code you trust. They are off in hosted mode (`PANTARR_MODE=hosted`).
`examples/connectors/csv-purchases` is a complete example (purchases from CSV documents).

## Cloud accounts (05/11)

| Connector | How | Notes |
|---|---|---|
| `google-calendar` | Google Calendar API v3, read only, « Connect with Google » (OAuth) | an OAuth client of type « Web application » with the redirect address `<PANTARR_BASE_URL>/api/v1/oauth/callback`; publish the app (« In production ») or Google drops the access after 7 days |
| `microsoft-calendar` | Microsoft Graph `calendarView`, `Calendars.Read` + `offline_access` | app registration « any directory and personal accounts », tenant `common` for outlook.com |
| `microsoft-todo` | Microsoft Graph To Do, `Tasks.ReadWrite` + `offline_access` | the list is found by name; checked = `completed` |
| `todoist` | Todoist API v1 with the personal token | open tasks of a project, plus those completed in the last two weeks as « checked »; close / reopen |

OAuth (`connectors/oauth/`): the manifest says `oauth: "google" | "microsoft"`; the client ID and secret are ordinary
settings, the refresh token a **hidden** secret (`hidden: true`, never written by the form) stored by
`GET /api/v1/oauth/callback`. Access tokens are cached in memory; a refresh token rotated by Microsoft is saved again
through `ctx.saveSecrets`.

## Help of a connector

Every connector has a **Help** button: step-by-step setup in the other application, then in Pantarr, per language
(`connectors/guides.ts`; `{redirect}` and `{base}` are filled in). A plugin brings its own in its manifest:
`guide: { fr: { intro, steps: [...], links: [{ label, url }] }, en: {...} }`.

## Other online stores: the learning script (05/11)

No French online grocery store has a public API (Leclerc, Carrefour, Auchan, Courses U, Chronodrive, Monoprix…):
recipe-to-basket integrations (Jow…) are private partnerships, and the sites are protected against bots. The stores
without a dedicated script share `connectors/stores/store.user.js`, configured per store in `stores.ts` (sites,
first-guess search page):

- it runs in the user's own browser, signed in on the site, and only repeats what the site itself does;
- it **learns once**, from the site's own requests: the search (the user searches « lait »: the request, or the
  results page address, becomes a template with `{q}`), then the adding (one product added by hand: the product id
  and the quantity are located in the request body or address);
- products are read from any JSON answer or page data (JSON-LD, Next.js, Nuxt) by their id / name / brand / price fields;
- without a learned adding: **assisted mode** (one « Search on the site » link per item);
- « Diagnostic » copies what was seen (addresses only, no header values), to write a dedicated adapter later.

Bridge CORS origins accept `https://*.domain` (one subdomain per Leclerc drive). Intermarché keeps its dedicated
script (`connectors/intermarche/cart.user.js`).

## Receipts without a document manager (05/11)

Every household, self-hosted or hosted, has a **receipts inbox** (Pantry page → Receipts and invoices; table
`Receipt`, file kept to read it again):

| Source | How |
|---|---|
| photo or PDF | « Add a receipt » (camera on a phone), `POST /api/v1/households/:id/receipts` (field `files`, 10 × 15 MB) |
| e-mail | the `mailbox` connector (IMAP, one folder, optional sender words): attachments, or the mail itself as text; every hour (`17 * * * *`) and on demand; in hosted mode, public servers only |
| online orders | the browser bridge posts what it added to the basket (`POST /bridge/:module/order`): bought today, without any invoice |
| Lidl Plus | `lidl-plus` connector: a userscript on the Lidl websites (every country) reads the digital receipts of the user's account (`/mre/api/v1/tickets`, items from the `data-*` attributes of the printed receipt) with the user's own session, asks Pantarr which are new (`POST /bridge/lidl-plus/unknown`) and sends them (`POST /bridge/lidl-plus/receipts`); at most every 6 hours, one year back the first time |
| phone « Share » | the web app is installable (manifest, icons) and a share target (`/share-target`, files kept by `sw.js`, sent by the Pantry page); Android (Chrome); not on iPhone (Safari has no share target) |

Reading, per the household setting `receiptReader` (Settings → Household → Shopping):
- `ocr` (default, no LLM call): text of the mail, text layer of the PDF (pdf.js through `unpdf`, lines rebuilt from the
  word positions), or **OCR of the photo** (Tesseract in WebAssembly, `tesseract.js` + `@tesseract.js-data/fra|eng`
  shipped in the image: nothing downloaded, nothing sent out); then the store reader (Intermarché) or the generic
  « label … price » reader; a scanned PDF without text layer → « send a photo instead »;
- `ocr-llm`: the same, then the household's LLM when fewer than 2 items were read;
- `llm`: the LLM directly with the file (Gemini: inline image / PDF; OpenAI-compatible: `image_url`, PDF as `file`). The same file twice is read once (sha256). Purchases get `externalId = receipt:<id>` (read again = replaced;
deleted with the receipt). LLM calls count in the quota (purpose `receipt`). Paperless stays supported.
