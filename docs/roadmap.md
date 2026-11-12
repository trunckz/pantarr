# Roadmap

Status: **phases 0-8 delivered**: in daily use by a first household and in a closed beta as a hosted service (licence: AGPL-3.0-or-later, SDK under MIT). The hosted offer is built and tested, not opened yet: legal review, hosting and provider accounts first ([hosted.md](hosted.md)).

| Phase | Content | Done when |
|---|---|---|
| **0. Skeleton** | monorepo (API, web, connector SDK), Prisma schema, Docker image, local login, roles, API keys, OIDC, i18n en/fr, admin settings page, health, OpenAPI | image builds, admin can log in, create users and API keys, configure OIDC |
| **1. Mealie + households** | Mealie connector (token), households and members, store areas, aisles from Mealie labels, settings UI | recipes and shopping list visible in Pantarr |
| **2. Planning** | **LLM usage metering per household (calls, tokens, cost) and quotas**, prompt template engine, LLM connectors (Gemini, OpenAI-compatible), background jobs, drafts per period, change one meal, validate → Mealie, optional calendar connectors (CalDAV incl. iCloud, ICS, Home Assistant; Google / Microsoft later) | a week planned and validated from the UI, page can be closed |
| **3. Shopping** | ingredients → Mealie list with store area, purchase rules, check / "we have it", add the meals of a period, recipe import by URL (Jow share links fixed, portions) | the household shops from Pantarr |
| **4. Purchases & pantry** | **Paperless-ngx documents connector (optional, API token)**; connector SDK for `purchases`; Intermarché (parsing of archived invoices and receipts, invoice links in e-mails, receipts through the browser bridge); products, pantry families seeded per locale, consumption estimate, learning | "to buy soon" list proposed every week |
| **5. Cart** | browser bridge userscript generated per user; Intermarché cart connector; habitual products, preferences, cart memory | basket filled from the list |
| **6. List sync** (optional) | Google Keep (two-way), Apple Shortcuts / Siri (add through the API), Home Assistant to-do, CalDAV tasks; Todoist and Microsoft To Do later | voice-added items reach the list, on Android and iPhone |
| **7. Openness** | Grocy inventory connector, more stores (Chronodrive, Leclerc, Kroger, Tesco…), dynamic connector loading, public release, docs site | first external contributor connector |
| **8. Hosted offer** | `PANTARR_MODE=hosted`: sign-up with e-mail check, plans and quotas, billing (Paddle or Stripe), automatic Mealie group per household, data export / account deletion (GDPR), EU hosting — see [hosted.md](hosted.md) | first paying household |

## Open questions

- **Google Keep from Node**: the prototype uses the Python `gkeepapi`. Options: port the needed calls (gpsoauth +
  Keep `changes` endpoint) to TypeScript, or ship the connector as a small optional sidecar.
- **Licence**: AGPL-3.0-or-later (like Mealie), connector SDK under MIT, contributions signed off (DCO) with a contributor
  licence agreement to keep dual licensing possible (CONTRIBUTING.md).
- **LLM cost / quota**: one call per period and one per "change" (as in the prototype); a local model as fallback
  is a later option.

## Requested improvements (04/11)

- **Connectors page**: every connector is enabled and configured individually on the Connectors page (generic form
  from its manifest, test button), not inside the household page.
- **Allergies per member**: list of the most common allergens (the 14 EU allergens: gluten, crustaceans, eggs, fish,
  peanuts, soy, milk, nuts, celery, mustard, sesame, sulphites, lupin, molluscs) plus custom ones; given to the LLM
  as hard constraints and checked on the ingredients.
- **Diets per member**: vegan, vegetarian, pescatarian, halal, kosher, gluten-free, lactose-free… plus custom ones.

## Requested improvements (05/11)

- **Menu on a phone**: the details of each meal (people, time, variants, notes) are folded by default and unfold on
  a tap ("unfold all" button); leftovers and allergy warnings stay visible. A **week view** (lunch / dinner × days,
  scrolls sideways on a phone) gives the whole period at a glance; the choice is remembered on the device.
- **Leftovers kept consistent**: every meal shows where its leftovers go ("leftovers_for") or come from
  ("leftovers_from", new in the answer format). Changing a meal sends the **whole menu** to the LLM; the meals linked
  by leftovers are offered for regeneration too (ticked by default) and replaced in the same call; a kept meal whose
  leftovers no longer match loses the link.
- **Shopping list by the LLM**: "Add to shopping" (and the validation) runs a background job: the LLM merges the same
  ingredient written differently, gives quantities as they are bought, leaves out leftovers meals, pantry staples,
  the Grocy stock and what is already on the list, and applies the purchase rules. Without a usable answer, the plain
  sum of the ingredients, with a warning.
- **Recipes as the source of truth (05/11)**: for a meal taken from a Mealie recipe, the time is the recipe's
  (`totalTimeSeconds`, else prep + cooking, else the text), shown with "≈" only when the model had to guess; the
  times are given to the model next to the recipe names. The ingredients are the recipe's, scaled from its servings
  to the people of the meal (a child counts ½) plus those eating its leftovers; plain-text lines (Jow imports) have
  their leading quantity read and scaled. The model only adds what goes with the recipe (side dish, a person's
  variant). The shopping list reads the recipes as they are in Mealie at that moment.
- **Shopping list without guesses (05/11)**: the model preparing the list no longer sees the menu, only the flat list
  of the real ingredients with where each comes from ("Pâtes carbonara", "Pâtes carbonara · variante Emma"): the
  scaled recipe lines, the side dishes, the variants' own ingredients. Its job is merging, buying units, stock,
  aisles; an item matching none of the ingredients given is left out and reported. Variants are structured
  (`replaces`, `ingredients`, `leftovers_from` per person): the recipe is scaled to the people really eating it.
  Leftovers links are believed only when both meals agree (or the later dish is the same / says "restes"): the
  planner had marked each dinner "leftovers for the next dinner" while the next dinner was another dish, which
  inflated quantities and dropped the next recipe's ingredients.
- **Ergonomics review (05/11)**:
  - phones: tab bar at the bottom for the four daily screens (Menu, Shopping, Pantry, Recipes); settings in the side menu;
  - menu: week by week (‹ period ›, the date picker behind the period); "Plan" opens a dialog with the length and
    **free instructions for this time** (guests, absences, food to finish), given to the model before the habits and
    kept with the draft (shown, and offered again when regenerating, also used by "Change");
  - shopping: **one list at a time** in tabs with their count (remembered), one field to add (aisle guessed, added
    to the list shown), **tap an item to edit it** (text, aisle, list), **⇄ to move it** to the other list, checked
    items folded, store and clean-up actions in the "…" menu; API `PATCH /shopping/items/:id` takes text, aisle, area;
  - settings of a household: tabs (Household, People, Menus, Shopping, Products, Aisles) instead of one long page;
    **default prompt** viewable (with its placeholders) and usable as a starting point
    (`GET /households/:id/planning/default-template`).
- **Missing connectors (05/11)**: Google Calendar and Outlook / Microsoft 365 (calendars, read only), Microsoft To Do
  and Todoist (shared lists) are implemented — no more « planned » connector. Google and Microsoft through « Connect »
  (OAuth, refresh token kept encrypted). Every connector has a Help button with the step-by-step setup in the other
  application, in French and English. More stores (Leclerc, Chronodrive, Carrefour…) stay to do: each needs its
  browser-bridge script, written and tested with an account of that store.
- **All online stores initialised (05/11)**: E.Leclerc Drive, Carrefour, Auchan, Courses U, Chronodrive and Monoprix
  as cart connectors sharing a learning userscript (search and adding learned from one search and one product added
  by hand in the user's browser, assisted mode otherwise). To check with a real account of each store, and to turn
  into dedicated adapters from the « Diagnostic » of the panel when a site resists.
- **Receipts for everyone (05/11)**: without a document manager — photos / PDF sent from the Pantry page, a mailbox
  connector (IMAP folder), online orders recorded by the bridge; read by the store reader, else by the LLM (photos and
  PDF), else by the generic reader. Then (05/11): OCR by default (Tesseract, no LLM), Lidl Plus receipts by the browser bridge, « Share » from an Android phone.
