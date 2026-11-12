# Hosted mode (`PANTARR_MODE=hosted`)

What changes compared with a self-hosted instance, and how to run it.

## Behaviour

| | Self-hosted (default) | Hosted |
|---|---|---|
| Sign-up | closed (accounts made by an administrator, SSO, or an invitation link) | `PANTARR_SIGNUP`: `open` (default), `code` (an invitation code, beta) or `closed`; then an e-mail check (link valid 48 h) |
| Household | made by an administrator | made at sign-up; its creator **owns** it (members, connectors, billing, invitations) |
| Mealie | the household's own connector | one **group per household** in the shared Mealie, created once the address is checked |
| LLM | the household's key | the platform's key within the **plan quota**, or the household's own key (no plan limit) |
| Connectors | all, plus plugins (`PANTARR_CONNECTORS_DIR`) | no Paperless, no Google Keep companion, no plugins; **private addresses refused** (SSRF guard, redirects checked) |
| Billing | none | Paddle (recommended: merchant of record, EU VAT) or Stripe; plans set by signed webhooks |
| Personal data | export / deletion in « My account » | the same; deletion refused while a subscription runs |

Owners exist on every instance: an administrator can make a user owner of a household (`PUT /households/:id/users`
with `ownerIds`), and invitations can give the role.

## Environment

| Variable | Use |
|---|---|
| `PANTARR_MODE=hosted` | turns the mode on |
| `PANTARR_SIGNUP=open\|code\|closed` | who can sign up; `code`: an invitation code made in Administration → Invitation codes (uses, expiry, plan given), shared as a link `https://<instance>/?code=BETA-…` |
| `PANTARR_SMTP_URL`, `PANTARR_MAIL_FROM` | e-mails (address check, invitations); without them the links are only logged |
| `PANTARR_MEALIE_URL`, `PANTARR_MEALIE_ADMIN_TOKEN` | shared Mealie and an API token of a Mealie administrator (groups and users) |
| `PANTARR_PLATFORM_GEMINI_KEY`, `PANTARR_PLATFORM_GEMINI_MODEL` | the platform's LLM (paid tier: the free tier lets Google reuse the data) |
| `PANTARR_PLANS` | plans as JSON: `[{"code":"family","name":"Family","price":"4 €/month","llmMonthlyCalls":48,"maxAccounts":6,"priceId":"pri_…"}]`; « free » is added when missing |
| `PANTARR_BILLING=paddle\|stripe`, `PANTARR_BILLING_WEBHOOK_SECRET` | provider and the secret of its webhook endpoint |
| `PANTARR_PADDLE_CLIENT_TOKEN`, `PANTARR_PADDLE_ENV`, `PANTARR_PADDLE_API_KEY` | Paddle.js (checkout overlay), sandbox or production, server key for the customer portal |
| `PANTARR_STRIPE_SECRET_KEY` | Stripe Checkout and customer portal sessions |
| `PANTARR_ISSUES_TOKEN` | fine-grained GitHub token (*Issues: read and write* on the repository of `PANTARR_ISSUES_URL`): « Report a problem » and « Suggest an idea » open a form in the app instead of GitHub, so users need no GitHub account. The tickets are public: e-mail addresses and phone numbers in the text are masked, nothing about the account is added; 5 tickets per hour and per address |

Webhook endpoint at the provider: `https://<instance>/api/v1/billing/webhook`. Paddle events:
`subscription.*`. Stripe events: `checkout.session.completed`, `customer.subscription.created|updated|deleted`.
The household is found from the custom data / metadata (`householdId`) put by the checkout, then from the
subscription id. A paid plan holds while the subscription is `active`, `trialing` or `past_due`.

## Before opening it

- Legal review (terms, privacy notice, licences, store terms of use).
- EU hosting, backups tested, monitoring; PostgreSQL and Mealie sized for the number of households.
- Starter recipes (50 recipes written for Pantarr, photos under free licences) are added to each new household's Mealie
  group in the background, and from the Recipes page while a household has fewer than 20 recipes.
- The SSRF guard resolves names before connecting: DNS rebinding between the check and the connection stays
  possible in theory; an egress firewall on the platform (no route to the private networks) closes it.

## Platform administration

Accounts with the role ADMIN (the first account, made at setup) see **Administration** (`/admin`, API `/api/v1/admin/*`):
- **Overview**: accounts (verified, active, new), households per plan, LLM calls and tokens of the month (per day, per
  use, per connector, failures), receipts (status, size), last job errors, configuration and health (mail, Mealie,
  platform LLM, sign-up mode, billing, plans, database size, uptime);
- **Households**: owners, accounts, plan (can be changed), LLM quota of the month used / available, a quota set by
  hand (`quotaOverride`, beats the plan), tokens, data, last activity, invitation code used;
- **Accounts**: households, role, address checked, created, last sign-in, enable / disable;
- **Invitation codes**: create (label, plan, number of uses, expiry, code given or generated), copy the sign-up link,
  disable; a used code cannot be deleted (it tells where a household comes from).

## Security settings

- **Sign-in with Microsoft**: in the app registration (Entra ID → Token configuration), add the optional claim
  **`xms_edov`** to the ID token. Without it, only personal Microsoft accounts (outlook.com, hotmail…) can sign in:
  the address of a work or school account is trusted only when the domain owner verified it (« nOAuth » attack).
- **Proxies**: by default the client's address is taken from the reverse proxy in front (private address) and from
  Cloudflare's published ranges. Another setup: `PANTARR_TRUST_PROXY` (number of hops, or addresses / subnets).
- **Limits** on sign-in, sign-up, password e-mails, extension pairing and incoming mail are kept in memory per
  server: with several replicas each counts its own (`PANTARR_RATE_LIMIT=off` removes them, for tests only).
- **Scheduled tasks** (list sync, mailboxes, purchases import) run on one server at a time (lock in the Job table).
- **Administrators' access** to a household they do not belong to is written to the log
  (`admin-household-access`, one line per administrator, household and hour): to be mentioned in the privacy policy.
- **Recipe import**: the address is checked (public addresses only) before Mealie downloads it; Mealie follows the
  redirects itself, so its outgoing traffic must still be limited by a firewall.
