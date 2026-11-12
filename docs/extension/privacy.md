# Pantarr browser extension — privacy policy

*Version française plus bas.*

Last updated: 12 November 2026.

The Pantarr extension connects your browser to **your own Pantarr account**: the Pantarr server you connect it to
(your self-hosted instance, or the hosted service you signed up for). The extension's author receives **nothing**.

## What the extension stores in your browser

When you connect it with the code shown in Pantarr, the extension keeps, in the browser's local extension storage:
the address of your Pantarr, a key that only allows the extension's routes (revocable in Pantarr, *My account*), the
identifier and name of your household. *Disconnect* in the extension, or removing it, deletes them.

## What it sends, and only to your Pantarr

| When | What is read | What is sent to your Pantarr |
|---|---|---|
| You open a supported online grocery site from Pantarr (*Send to the online store*) | the site's product search results and the requests the site makes to add a product to the basket | the products you choose for each item of your list, and the items added to the basket |
| You are signed in on Lidl Plus or Intermarché | your receipts in your customer account on that site | the receipts Pantarr does not have yet (date, store, items, prices; the PDF for Intermarché) |
| You click *Add to Pantarr* on a supported recipe site | the address of the recipe page | that address, so that your Pantarr imports the recipe |
| You open the extension's window | — | your connection code (once), then a check that the key is still valid |

Nothing is sent before you connect the extension, nothing is sent to anyone else than the Pantarr address you typed
or chose, and the extension does not collect your browsing history, does not run on other sites than the ones listed
in its permissions, contains no analytics, no advertising and no remote code. What your Pantarr does with the data is
described by the privacy policy of that Pantarr (the `/privacy` page of the instance).

## Contact

Questions or problems: open a ticket on <https://github.com/trunckz/pantarr/issues> (or from Pantarr's user menu).
Source code: <https://github.com/trunckz/pantarr> (`apps/api/src/extension`, `apps/api/src/connectors`).

---

# Extension Pantarr pour le navigateur — confidentialité

Dernière mise à jour : 12 novembre 2026.

L'extension Pantarr relie votre navigateur à **votre propre compte Pantarr** : le serveur Pantarr auquel vous la
connectez (votre instance auto-hébergée, ou le service hébergé où vous êtes inscrit). L'auteur de l'extension ne
reçoit **rien**.

## Ce que l'extension garde dans votre navigateur

Une fois connectée avec le code affiché dans Pantarr, l'extension garde dans le stockage local de l'extension :
l'adresse de votre Pantarr, une clé qui n'ouvre que les routes de l'extension (révocable dans Pantarr, *Mon compte*),
l'identifiant et le nom de votre foyer. *Déconnecter* dans l'extension, ou la supprimer, les efface.

## Ce qu'elle envoie, et seulement à votre Pantarr

| Quand | Ce qui est lu | Ce qui est envoyé à votre Pantarr |
|---|---|---|
| Vous ouvrez un drive pris en charge depuis Pantarr (*Envoyer au drive*) | les résultats de recherche de produits du site et les requêtes du site pour ajouter un produit au panier | les produits choisis pour chaque article de votre liste, et les articles ajoutés au panier |
| Vous êtes connecté à Lidl Plus ou Intermarché | vos tickets dans votre compte client sur ce site | les tickets que Pantarr n'a pas encore (date, magasin, articles, prix ; le PDF pour Intermarché) |
| Vous cliquez sur *Ajouter à Pantarr* sur un site de recettes pris en charge | l'adresse de la page de la recette | cette adresse, pour que votre Pantarr importe la recette |
| Vous ouvrez la fenêtre de l'extension | — | votre code de connexion (une fois), puis une vérification que la clé est toujours valable |

Rien n'est envoyé avant la connexion de l'extension, rien n'est envoyé à quelqu'un d'autre que l'adresse de Pantarr
que vous avez saisie ou choisie ; l'extension ne collecte pas votre historique de navigation, ne s'exécute que sur
les sites listés dans ses autorisations, et ne contient ni mesure d'audience, ni publicité, ni code chargé à
distance. Ce que votre Pantarr fait des données est décrit par la politique de confidentialité de ce Pantarr (page
`/privacy` de l'instance).

## Contact

Questions ou problèmes : ouvrez un ticket sur <https://github.com/trunckz/pantarr/issues> (ou depuis le menu
utilisateur de Pantarr). Code source : <https://github.com/trunckz/pantarr>.
