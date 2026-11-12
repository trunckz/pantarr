# Pantarr — architecture

Pantarr is a self-hosted companion for [Mealie](https://mealie.io): it plans a household's meals with an LLM,
builds and maintains the shopping list, learns what the household buys (receipts, online orders) to predict when
staples run out, and talks to grocery stores through pluggable connectors (purchase history, cart filling).

Mealie stays the source of truth for **recipes, the validated meal plan and the shopping list**; the menu drafts
(proposals, changes, leftovers between meals) live in Pantarr until they are validated. Pantarr owns everything that
is about the **household** (people, rules, habits, purchases, stock, preferences, budget) and the **automation** around it.

## 1. Principles

- **One container**, one database. `docker compose up` with PostgreSQL; SQLite is not planned (Prisma migrations
  and JSON columns are written for PostgreSQL).
- **Core is generic, everything specific is data**: the rules of a given family (who eats when, dietary rules,
  children eating the adults' leftovers, store habits, product preferences…) live in the database and the settings
  pages, never in code.
- **Only the recipes backend (Mealie) and an LLM are required.** Calendar, shared list, document manager, store
  connectors and inventory are optional modules: each one adds a capability, none is needed to plan and shop.
- **Connectors are modules** behind small TypeScript interfaces. A store (Intermarché, Chronodrive, Kroger, Tesco…)
  provides up to two connectors: *purchases* (history: receipts, invoices, orders) and *cart* (fill the online
  basket). Other connector kinds: LLM, calendar, shared list, inventory.
- **API first**: the web UI uses the same REST API as third-party apps (OpenAPI documented, API keys).
- **Multi-user, multi-language** from the start (admin / user roles, OIDC SSO, i18n for UI and API messages).

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| API | **NestJS 11** (TypeScript, Node 22) | modules + dependency injection map well to connectors; very common |
| Database | **PostgreSQL 16** with **Prisma** | typed client, migrations, JSON columns for connector settings |
| Jobs | in-process scheduler (`@nestjs/schedule`) + a `jobs` table | long tasks (LLM calls, imports) survive page close and restarts |
| Web | **React 19 + Vite + Mantine 8**, React Router, TanStack Query | standard dashboard look (sidebar like the *arr apps, cards like Mealie) |
| i18n | **i18next** (web) + JSON message catalogues (API) | `en` and `fr` shipped, community translations by adding a JSON file |
| Auth | local accounts (argon2), **OIDC** (`openid-client`), sessions as signed JWT cookies, **API keys** | SSO with Authentik / Keycloak / Authelia… |
| Packaging | multi-stage **Dockerfile**, `docker-compose.yml` | the API serves the built web app |

## 3. Domain model (core)

```
Household ─┬─ Member (adult/child, birth date, dietary rules, meal rules)
           ├─ Settings (locale, planning horizon, store areas, prompts…)
           ├─ MealPlanDraft (period, status, LLM answer, per-meal ingredients) ──► Mealie meal plan
           ├─ MealFeedback (validated / replaced dishes → learned habits)
           ├─ ShoppingItem link (Mealie list item ↔ origin: meal, pantry, list sync, manual; store area)
           ├─ Product (normalised product seen in purchases: label, brand, store, source)
           ├─ Purchase (product, date, quantity, source connector)
           ├─ PantryFamily (e.g. "Diapers (Lina)": keywords, excludes, aisle, forced cycle, learned factor)
           ├─ PantryEvent ("we still have some", bought from the list…)
           ├─ ProductPreference (article pattern → product query, e.g. "Water → Native")
           ├─ PurchaseRule (free text given to the LLM: "minced steak: always frozen")
           └─ ConnectorInstance (module id, kind, enabled, settings, secrets encrypted)
User (role admin|user, locale, OIDC subject) ── memberships ── Household
ApiKey (owner, name, prefix, argon2 hash, scopes, last use)
Job (kind, status, payload, result, error)   — background work, idempotent per key
```

## 4. Core services

| Service | Role |
|---|---|
| **Planning** | builds the prompt from members, presence (calendar connector), habits, recent meals, recipes (Mealie), fresh products bought most, purchase rules; calls the LLM connector in a background job; stores the draft per period; "change one meal"; validate → Mealie meal plan |
| **Shopping** | merges ingredients of the validated meals, pantry suggestions, shared-list items and manual items into the **Mealie shopping list** (labels = aisles), with a *store area* per item (in-store vs online), check/remove, "we already have it" |
| **Pantry** | groups purchases into families, estimates consumption rate (recent window first), predicts the next purchase, learns a correction factor from feedback and from the actual purchase dates |
| **Habits** | most bought products, dishes validated or replaced often, product chosen for an article (cart memory) |
| **Settings** | household and global settings, admin only for global ones; connector instances |
| **Auth & users** | local login, OIDC, roles, API keys with scopes |

## 5. Connector kinds

Every connector is a NestJS provider registered in the `ConnectorRegistry` with a manifest (id, kind, name,
settings schema, capabilities). Built-in connectors live in `apps/api/src/connectors/*`; third-party ones are loaded at start from
`PANTARR_CONNECTORS_DIR` on a self-hosted instance (docs/connectors.md, example in `examples/connectors/`).

| Kind | Interface (simplified) | First implementations |
|---|---|---|
| `recipes` | recipes, meal plan, shopping list, labels | **Mealie** (API token) — required |
| `llm` | `complete(prompt, jsonSchema) → JSON` | **Gemini**, **OpenAI-compatible** (OpenAI, Ollama, LM Studio…) |
| `calendar` *(optional)* | events in a period → presence per meal | **CalDAV** (iCloud with an app-specific password, Nextcloud, Fastmail), **ICS address**, Google Calendar, Outlook / Microsoft 365, Home Assistant |
| `documents` *(optional, recommended)* | purchase documents archived in a document manager (text + metadata), upload of new receipts | **Paperless-ngx** (REST API, token) |
| `purchases` | `import(since)` and/or `parse(document) → Purchase[]` (receipts, invoices, orders) | **Intermarché** (online invoices by e-mail link, in-store receipts through the browser bridge, parsing of archived documents) |
| `cart` | `prepare(items) → CartPlan`, executed by the **browser bridge** | **Intermarché** |
| `list-sync` *(optional)* | two-way sync of a shared list (items, checked state) | **Google Keep**, **Apple Shortcuts / Siri** (Reminders has no open API: a Shortcut calls the Pantarr API), CalDAV tasks (Nextcloud), Todoist, Microsoft To Do, Home Assistant to-do lists (Bring!, OurGroceries…) |
| `inventory` | stock levels, consumption | **Grocy** (planned) — alternative to the stock learned from purchases |

### Documents: optional, but what makes Pantarr learn

Pantarr works without any document manager (planning, shopping list, cart). With one, it **learns**: the purchase
connectors parse the receipts and invoices archived there (store-specific line formats and abbreviations), which feeds
the purchase history, the pantry estimates, the habitual products and the fresh products given to the LLM. The first
documents connector talks to **Paperless-ngx through its REST API** (API token, filter by correspondent / document
type / date, `content` text); receipts uploaded by the browser bridge can be archived there too. Without a document
manager, purchases can still come straight from a store connector (bridge uploads, e-mails).

### Browser bridge (stores protected against bots)

Many grocery sites (Intermarché, Leclerc, Carrefour…) are protected by anti-bot services and only accept calls from
the customer's own browser. Pantarr never works around these protections: store connectors that need the site's
session ship a **userscript** (Violentmonkey / Tampermonkey / Userscripts on iOS) generated by Pantarr, which runs
in the user's browser on the store site and talks to the Pantarr API with a personal API key:

- *purchases*: reads the receipts of the customer account and uploads them;
- *cart*: receives the items to buy, searches the store catalogue, proposes the habitual products first
  (★, verified against the purchase history), lets the user adjust, and adds them to the basket.

Slot booking and payment always stay manual.

## 6. API

- REST under `/api/v1`, OpenAPI at `/api/docs`.
- Authentication: session cookie (web) **or** `Authorization: Bearer <api key>` (`ptr_…`), keys hashed with argon2,
  scopes `read`, `write`, `admin`, `bridge` (userscripts).
- Errors and validation messages are translated (`Accept-Language`).

## 7. Users, roles, SSO

- First start: setup wizard creates the admin account (or `PANTARR_ADMIN_EMAIL` / `PANTARR_ADMIN_PASSWORD`).
- Roles: **admin** (global settings, connectors, users, all households) and **user** (their household).
- OIDC: issuer URL, client id/secret, scopes, claim for the admin group (`PANTARR_OIDC_ADMIN_GROUP`); accounts created
  on first login; local login can be disabled.

## 8. Internationalisation

- Web: `apps/web/src/i18n/<lang>.json`; API: `apps/api/src/i18n/<lang>.json`.
- Domain data that the LLM reads (prompt template, pantry families, aisle names, purchase rules) is seeded **per
  locale** and editable, so a US household gets "Produce, Meat & Seafood, Dairy…" and a French one "Fruits et
  légumes, Boucherie…".

## 9. Deployment

```yaml
services:
  pantarr:
    image: ghcr.io/<owner>/pantarr:latest
    environment:
      DATABASE_URL: postgresql://pantarr:pantarr@db:5432/pantarr
      PANTARR_SECRET: <random 32+ chars>      # cookies, encryption of connector secrets
      PANTARR_BASE_URL: https://pantarr.example.com
    ports: ["9925:9925"]
  db:
    image: postgres:16-alpine
```

## 10. From the homelab prototype

Pantarr is the rewrite of the `repas` page of the author's homelab (FastAPI + one HTML page, July–November 2026
private notes). Everything that was hard-coded there becomes data:

| Prototype | Pantarr |
|---|---|
| prompt v9 (Emma's split menu, Paul's meat or fish, children eat the adults' leftovers…) | default prompt template + **member rules** |
| 28 habitual dishes, 46 Jow/750g recipes | Mealie recipes + learned habits |
| `regles_achat`, `produits_preferes`, `placard`, `durees_stock` | PurchaseRule, ProductPreference, pantry settings |
| 29 hard-coded pantry families, French keywords | seeded PantryFamily rows per locale |
| `RAYONS_MAGASIN` (only meat, fish, fresh produce in store) | store areas setting |
| Intermarché userscript v15, `produits_habituels.py` (Paperless) | `intermarche` purchases + cart connectors |
| Google Keep sync (gkeepapi) | `google-keep` list-sync connector |
