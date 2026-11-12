# Pantarr

**Self-hosted meal planning & smart groceries, built around [Mealie](https://mealie.io).**

Pantarr plans your household's week with an LLM (who eats when, everyone's rules, leftovers for the kids, what you
usually cook and buy), keeps **one shopping list** in Mealie split between in-store and online, **learns from your
receipts and invoices** what will run out soon, and fills your online grocery basket with the products you
actually buy.

> Status: in daily use by its first household and in a closed beta as a hosted service. Progress: [docs/roadmap.md](docs/roadmap.md).

## What it does today

- **Menus**: a week proposed by the LLM from the household's people and rules (allergies, diets, who eats when from
  the calendars), habits and recipes ; change one meal (the meals linked by leftovers follow), validate into Mealie.
  Times and quantities come from the Mealie recipes, scaled to the people. Week view, food balance and budget.
- **Shopping**: one list (Mealie) split between in store and online, built from the real recipes, purchase rules and
  preferred products ; synced both ways with Google Keep, Home Assistant to-do, CalDAV tasks, Microsoft To Do, Todoist.
- **Purchases and stock**: receipts and invoices from Paperless-ngx, a mailbox, Gmail, a forwarding address or a
  photo ; Intermarché read in detail, other stores by OCR or the LLM ; a stock estimate per product
  family that learns ; Grocy when there is one.
- **Drive basket**: a browser extension (or userscript) fills the basket of Intermarché, Leclerc, Carrefour, Auchan,
  U, Chronodrive, Monoprix or Lidl Plus with the products the household buys.
- **Accounts**: households with owners and members, invitations, OIDC single sign-on, Google / Microsoft sign-in,
  API keys, English and French ; a hosted mode (sign-up, plans, billing) for a public service.

## What makes it different

- **Household rules as data**: per-member dietary rules, presence from your calendar, purchase rules ("minced steak:
  always frozen"), preferred products ("Water → Native").
- **Learns from real purchases**: receipts and invoices (from a document manager such as Paperless-ngx, or straight
  from a store connector) feed a pantry estimate per product family that corrects itself over time.
- **Store connectors**: each store brings two optional modules — *purchases* (history) and *cart* (basket filling,
  through a userscript running in your own browser for sites protected against bots).
- **Everything optional but Mealie and an LLM**: calendar (CalDAV/iCloud, ICS, Google, Outlook, Home Assistant),
  shared list (Google Keep, Apple Shortcuts/Siri, Home Assistant to-do, Todoist…), documents (Paperless-ngx),
  inventory (Grocy).
- **Multi-user, SSO (OIDC), API keys, i18n** (English, French) from day one.
- **Security**: session tokens that can be revoked, OAuth answers tied to the browser that asked, limits on sign-in
  and e-mail routes, strict Content-Security-Policy, SSRF guard on every address typed by a household (hosted).

## Quick start (Docker)

```bash
cp .env.example .env        # set PANTARR_SECRET, POSTGRES_PASSWORD, PANTARR_BASE_URL
docker compose up -d --build
```

Open `http://localhost:9925`: the first visit creates the administrator. Then, in **Administration → Connectors**,
give the address and an API token of your Mealie, and an LLM key (Google Gemini or any OpenAI-compatible API); the
start-up assistant walks a household through the rest. API documentation: `/api/docs`.

Behind a reverse proxy, set `PANTARR_BASE_URL` to the public address ; every setting is described in
[.env.example](.env.example). Back up the PostgreSQL database and keep `PANTARR_SECRET`: the stored secrets
(connector tokens) are encrypted with it.

## Development

```bash
npm install
npm run build               # SDK, API, web
# API: DATABASE_URL=postgresql://… PANTARR_SECRET=… npm run dev:api  (then node apps/api/dist/main.js)
npm run dev:web             # http://localhost:5173, proxies /api to :9925
npm run lint                # ESLint ; npm test: unit tests (API: Jest, web: Vitest)
# end-to-end tests: DATABASE_URL=postgresql://…/pantarr_test npm run test:e2e -w @pantarr/api
```

Monorepo: `apps/api` (NestJS, Prisma, PostgreSQL), `apps/web` (React, Mantine, i18next),
`packages/connector-sdk` (connector contracts). Architecture: [docs/architecture.md](docs/architecture.md);
writing a connector: [docs/connectors.md](docs/connectors.md).

## Licence

Pantarr is free software under the [GNU Affero General Public License v3.0 or later](LICENSE): you may use, study,
modify and share it; if you run a modified version as a service for others, you must offer them its source code.
The connector SDK (`packages/connector-sdk`) is under the [MIT licence](packages/connector-sdk/LICENSE), so that
connectors can be written under any licence. Bugs and ideas: [open a ticket](https://github.com/trunckz/pantarr/issues/new/choose) (also from the user menu of the
app, *Report a problem* / *Suggest an idea*, prefilled with the version). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md);
reporting a security issue: [SECURITY.md](SECURITY.md).
