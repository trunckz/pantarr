# Publishing the extension (Chrome Web Store, Firefox Add-ons)

Everything a maintainer needs to publish or update the extension. The listing texts are ready to paste.

## 1. Build the archives

```bash
npm ci
npm run extension:pack            # → dist/extension/pantarr-extension-<version>-chrome.zip and -firefox.zip
```

- No default Pantarr address: at first use, the user types the address of their Pantarr and the code shown in
  Pantarr (*Settings → Connectors → Browser extension*). For a hosted service with its own domain, build with
  `npm run extension:pack -- --base https://app.example.com`: the address is then pre-filled.
- The window of the extension calls only `/api/v1/extension/pair` and `/api/v1/auth/me` of the chosen Pantarr, which
  answer the extension origins (CORS, `app.setup.ts`): no access to any other site is requested.
- Before each new version: raise `EXTENSION_VERSION` in `apps/api/src/extension/extension.ts` (the stores refuse a
  version already published). Check the Firefox archive with `npx web-ext lint -s <unzipped folder>`: 0 error expected
  (the `innerHTML` warnings are explained to the reviewers below).
- Tag `extension-v<version>` on GitHub: the *Extension* workflow builds both archives and attaches them to a release.

## 2. Accounts (once)

| Store | Account | Cost | Notes |
|---|---|---|---|
| Chrome Web Store | <https://chrome.google.com/webstore/devconsole> with a Google account | 5 US$ once | 2-step verification required; **trader / non-trader** declaration (EU Digital Services Act): a trader's address and phone are shown publicly |
| Firefox Add-ons | <https://addons.mozilla.org/developers/> with a Mozilla account | free | the add-on ID is `extension@pantarr.app` (set in the manifest) |
| Edge Add-ons (optional) | <https://partner.microsoft.com/dashboard/microsoftedge/> | free | the Chrome archive works as it is |

## 3. Listing

**Name**: Pantarr
**Category**: Chrome *Shopping*; Firefox *Shopping*.
**Languages**: English (default) and French.
**Homepage**: <https://github.com/trunckz/pantarr> — **Support**: <https://github.com/trunckz/pantarr/issues>
**Privacy policy**: <https://github.com/trunckz/pantarr/blob/main/docs/extension/privacy.md>
**Icon**: in the archive (`icons/icon-128.png`). **Small promo tile** (Chrome, 440×280): `promo-440x280.png`;
**marquee** (optional, 1400×560): `promo-1400x560.png`.
**Screenshots** (1280×800 or 640×400, 1 to 5; real ones, taken in a browser):
1. the Pantarr panel on a drive site, list matched to products, before *Add to basket*;
2. the window of the extension: address + code, then *Extension connected*;
3. the *Add to Pantarr* button on a recipe page (Marmiton);
4. the shopping list in Pantarr with its *Send to the online store* button;
5. receipts read from Lidl Plus / Intermarché, in Pantarr's pantry.

### Summary (Chrome ≤ 132 characters, Firefox ≤ 250)

- EN: `Your Pantarr shopping list fills your online grocery basket; recipes and store receipts go straight into Pantarr.`
- FR : `Votre liste Pantarr remplit le panier de votre drive ; recettes et tickets de caisse arrivent directement dans Pantarr.`

### Description — English

```
Pantarr plans your household's meals and keeps one shopping list. This extension is its companion in the browser:

• Online grocery basket: from Pantarr, "Send to the online store" opens Intermarché, E.Leclerc Drive, Carrefour,
  Auchan, Courses U, Chronodrive or Monoprix and fills the basket with the products you usually buy. You check
  the choices, then add them in one click.
• Receipts: signed in on Lidl Plus or Intermarché, your receipts are sent to Pantarr, which learns what you buy and
  what will run out soon.
• Recipes: an "Add to Pantarr" button on Marmiton, 750g, Cuisine AZ, Jow, Ptitchef, Cuisine Actuelle, Journal des
  Femmes Cuisine, Cookomix, HelloFresh, Ricardo, Allrecipes, BBC Good Food and Chefkoch — one recipe, or all your
  favourites at once.

You need a Pantarr account: your own server (Pantarr is free software, AGPL) or a hosted Pantarr. Connect the
extension once with the address of your Pantarr and the code it shows (Settings → Connectors → Browser extension).

Privacy: the extension talks only to the Pantarr you connect it to. No analytics, no advertising, no remote code.
Source code: https://github.com/trunckz/pantarr
```

### Description — français

```
Pantarr prépare les menus de la semaine du foyer et tient une seule liste de courses. Cette extension est sa
compagne dans le navigateur :

• Panier drive : depuis Pantarr, « Envoyer au drive » ouvre Intermarché, E.Leclerc Drive, Carrefour, Auchan,
  Courses U, Chronodrive ou Monoprix et remplit le panier avec les produits que vous achetez d'habitude. Vous
  vérifiez les choix, puis ajoutez tout en un clic.
• Tickets de caisse : connecté à Lidl Plus ou Intermarché, vos tickets sont envoyés à Pantarr, qui apprend ce que
  vous achetez et ce qui va bientôt manquer.
• Recettes : un bouton « Ajouter à Pantarr » sur Marmiton, 750g, Cuisine AZ, Jow, Ptitchef, Cuisine Actuelle,
  Journal des Femmes Cuisine, Cookomix, HelloFresh, Ricardo, Allrecipes, BBC Good Food et Chefkoch — une recette,
  ou tous vos favoris d'un coup.

Il faut un compte Pantarr : votre propre serveur (Pantarr est un logiciel libre, AGPL) ou un Pantarr hébergé.
Connectez l'extension une fois avec l'adresse de votre Pantarr et le code qu'il affiche (Réglages → Connecteurs →
Extension du navigateur).

Confidentialité : l'extension ne parle qu'au Pantarr auquel vous la connectez. Ni mesure d'audience, ni publicité,
ni code chargé à distance. Code source : https://github.com/trunckz/pantarr
```

## 4. Chrome Web Store — *Privacy practices* tab

**Single purpose**: `Connect the user's Pantarr meal planner to grocery and recipe websites: fill the online grocery
basket from the Pantarr shopping list, and send the user's receipts and chosen recipes to their Pantarr.`

**Permission justifications**:
- `storage`: `Keeps the address of the user's Pantarr, the key given when the extension is connected and the household, so the extension stays connected.`
- Host permissions (store sites): `The extension runs only on the supported grocery sites, to search the products of the user's list and add them to the basket the way the site itself does, and on Lidl Plus / Intermarché accounts to read the user's receipts.`
- Host permissions (recipe sites): `Shows an "Add to Pantarr" button on the supported recipe sites and sends the recipe address to the user's Pantarr.`
- Remote code: **No**, I am not using remote code (every script is in the package).

**Data usage** (tick): *Financial and payment information* (purchase receipts), *Website content* (products, recipe
addresses). Leave the others unticked. Certify the three statements (no sale, no unrelated use, no credit use).

## 5. Firefox Add-ons

- Upload the `-firefox.zip`; platforms: **Firefox** (desktop). Source code: not needed (nothing is minified or
  bundled; the files are generated from `apps/api/src/extension` and `apps/api/src/connectors` by `extension:pack`,
  say it in the notes if asked).
- Data collection is declared in the manifest (`websiteContent`, `financialAndPaymentInfo`, required): Firefox shows
  it at install.
- License: *GNU Affero General Public License v3.0 or later*. Privacy policy: paste the English part of
  `privacy.md`.

## 6. Notes for reviewers (both stores, private field)

```
Pantarr is a self-hostable meal planner (AGPL, https://github.com/trunckz/pantarr). The extension needs a Pantarr
account; a test account on our beta instance:
  address: <TO FILL: beta address>    invitation code: <TO FILL>    (sign up, then Settings → Connectors →
  Browser extension → "Get a code", type the address and the code in the extension window)

- stores/*.js run in the page ("world": "MAIN") on the grocery sites only: the sites call their own APIs with tokens
  held by the page, which an isolated content script cannot reuse. They receive the Pantarr address and key from
  bridge.js through a DOM event, never from the page.
- innerHTML is used only for the extension's own panel; every dynamic value (product names, list items) is escaped
  first (esc() / echap(): & < > " replaced).
- Network calls go only to the Pantarr address typed by the user and to the store site itself. No remote code,
  no analytics.
- Testing the basket needs a customer account on one of the grocery sites; recipes can be tested without one
  (e.g. any Marmiton recipe page → "Ajouter à Pantarr").
```

## 7. After publication

Put the store pages in the Pantarr configuration, so that *Settings → Connectors → Browser extension* links to them:
`PANTARR_EXTENSION_CHROME_URL`, `PANTARR_EXTENSION_FIREFOX_URL`.
