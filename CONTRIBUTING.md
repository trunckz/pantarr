# Contributing to Pantarr

Thank you for helping! Pantarr is a meal planning and grocery companion for households: every change should keep it
simple for people who are not technical (the hosted offer hides everything complex).

## Licence and sign-off

- Pantarr is licensed under the **GNU Affero General Public License v3.0 or later** (`LICENSE`). The connector SDK
  (`packages/connector-sdk`) is under the **MIT licence**, so that connectors can be written under any licence.
- Every commit must be signed off (`git commit -s`), which certifies the
  [Developer Certificate of Origin](https://developercertificate.org/): you wrote the change or have the right to
  give it under the project's licence.
- **Contributor licence agreement**: before a first contribution is merged, contributors are asked to accept a short
  agreement that lets the maintainer also distribute their contribution under other licences (to keep a dual licence
  possible for the hosted offer). Your contribution stays available under the AGPL in every case.

## Development

```bash
npm install
npm run build                     # SDK, API, web
npm run lint
npm test -w @pantarr/api          # unit tests (Jest)
npm test -w @pantarr/web          # unit tests (Vitest)
npm run test:e2e -w @pantarr/api  # end-to-end tests, needs DATABASE_URL (PostgreSQL)
```

The CI runs the same steps on every push and pull request; a pull request is merged only when it is green.

## Conventions

- One subject per commit and per pull request; a clear message (what and why).
- Interface texts in **every** language file (`apps/web/src/i18n/*.json`, `apps/api/src/i18n/*.json`): a test checks
  that they have the same keys.
- No personal data in the sources, tests or fixtures: use invented names and `example.com` addresses.
- A new connector: see `docs/connectors.md`; store sites change often, so add tests with recorded answers.
- Security issues: never in a public issue, see `SECURITY.md`.
