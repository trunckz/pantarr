// Step-by-step help of each built-in connector, per language: what to do in the other application, then in Pantarr.
// « {redirect} » is replaced by the OAuth return address of this Pantarr, « {base} » by its address. `code` is shown
// as code. A plugin can bring its own guide in its manifest (« guide »).
import type { ConnectorGuide } from "@pantarr/connector-sdk";
import { config } from "../config";
import { redirectUri } from "./oauth/oauth";
import { STORES } from "./stores/stores";

type Guides = Record<string, Record<"fr" | "en", ConnectorGuide>>;

const GOOGLE_CLIENT = {
  fr: [
    "Ouvrez la console Google Cloud et créez un projet (par exemple « Pantarr ») avec votre compte Google.",
    "Menu « API et services » → « Bibliothèque » : cherchez et activez « Google Calendar API ».",
    "Menu « Google Auth Platform » (ou « Écran de consentement OAuth ») : type d'utilisateurs « Externe », nom de l'application « Pantarr », votre adresse comme contact. Dans « Audience », ajoutez votre compte Google aux utilisateurs test.",
    "Toujours dans « Audience », cliquez sur « Publier l'application » (passage « En production ») : en mode « Test », Google coupe l'accès au bout de 7 jours. Inutile de demander la validation Google pour un usage personnel.",
    "Menu « Clients » → « Créer un client » → type « Application Web ». Dans « URI de redirection autorisés », ajoutez exactement : `{redirect}`",
    "Copiez l'ID client et le code secret du client.",
  ],
  en: [
    "Open the Google Cloud console and create a project (e.g. \"Pantarr\") with your Google account.",
    "\"APIs & Services\" → \"Library\": find and enable \"Google Calendar API\".",
    "\"Google Auth Platform\" (or \"OAuth consent screen\"): user type \"External\", app name \"Pantarr\", your address as contact. Under \"Audience\", add your Google account to the test users.",
    "Still under \"Audience\", click \"Publish app\" (\"In production\"): in \"Testing\" mode Google drops the access after 7 days. No need for Google's verification for personal use.",
    "\"Clients\" → \"Create client\" → type \"Web application\". Under \"Authorized redirect URIs\", add exactly: `{redirect}`",
    "Copy the client ID and the client secret.",
  ],
};

const MS_CLIENT = (permission: string) => ({
  fr: [
    "Ouvrez le centre d'administration Microsoft Entra (entra.microsoft.com) ou le portail Azure avec votre compte Microsoft. Un compte personnel (outlook.com, hotmail…) convient : un annuaire par défaut lui est associé.",
    "« Applications » → « Inscriptions d'applications » → « Nouvelle inscription ». Nom : « Pantarr ». Types de comptes : « Comptes dans un annuaire organisationnel et comptes Microsoft personnels ».",
    "URI de redirection : plateforme « Web », adresse exacte : `{redirect}` → « S'inscrire ».",
    "Dans « Vue d'ensemble », copiez l'« ID d'application (client) ».",
    "« Certificats et secrets » → « Nouveau secret client » → copiez la VALEUR (pas l'ID du secret). Notez sa date d'expiration : il faudra en créer un nouveau à ce moment.",
    `« Autorisations d'API » → « Ajouter une autorisation » → « Microsoft Graph » → « Autorisations déléguées » : cochez \`${permission}\` et \`offline_access\`.`,
  ],
  en: [
    "Open the Microsoft Entra admin center (entra.microsoft.com) or the Azure portal with your Microsoft account. A personal account (outlook.com, hotmail…) works: it comes with a default directory.",
    "\"Applications\" → \"App registrations\" → \"New registration\". Name: \"Pantarr\". Account types: \"Accounts in any organizational directory and personal Microsoft accounts\".",
    "Redirect URI: platform \"Web\", exact address: `{redirect}` → \"Register\".",
    "Under \"Overview\", copy the \"Application (client) ID\".",
    "\"Certificates & secrets\" → \"New client secret\" → copy the VALUE (not the secret ID). Note its expiry date: a new one will be needed then.",
    `"API permissions" → "Add a permission" → "Microsoft Graph" → "Delegated permissions": tick \`${permission}\` and \`offline_access\`.`,
  ],
});

const PANTARR_OAUTH = (who: string) => ({
  fr: [
    "Dans Pantarr, sur ce connecteur : « Paramétrer », collez l'ID client et le secret, puis « Enregistrer et activer ».",
    `Cliquez sur « Se connecter avec ${who} », choisissez votre compte et acceptez. ${who === "Google" ? "Si Google affiche « Google n'a pas validé cette application », cliquez sur « Paramètres avancés » puis « Accéder à Pantarr »." : ""}`,
    "De retour dans Pantarr, le connecteur est « Connecté » : « Tester » pour vérifier.",
  ],
  en: [
    "In Pantarr, on this connector: \"Configure\", paste the client ID and secret, then \"Save and enable\".",
    `Click "Connect with ${who}", pick your account and accept. ${who === "Google" ? "If Google shows \"Google hasn't verified this app\", click \"Advanced\" then \"Go to Pantarr\"." : ""}`,
    "Back in Pantarr, the connector shows \"Connected\": \"Test\" to check.",
  ],
});

const HA_TOKEN = {
  fr: "Dans Home Assistant, cliquez sur votre nom en bas à gauche → onglet « Sécurité » → « Jetons d'accès longue durée » → « Créer un jeton », nommez-le « Pantarr » et copiez-le (il ne sera plus affiché).",
  en: "In Home Assistant, click your name at the bottom left → \"Security\" tab → \"Long-lived access tokens\" → \"Create token\", name it \"Pantarr\" and copy it (it is shown only once).",
};
const NEXTCLOUD = {
  fr: "Nextcloud : adresse `https://votre-nextcloud/remote.php/dav`, utilisateur Nextcloud, et un mot de passe d'application (Paramètres personnels → Sécurité → « Créer un nouveau mot de passe d'application »).",
  en: "Nextcloud: address `https://your-nextcloud/remote.php/dav`, your Nextcloud user, and an app password (Personal settings → Security → \"Create new app password\").",
};

export const GUIDES: Guides = {
  mealie: {
    fr: { intro: "Mealie garde les recettes, le planning et la liste de courses : c'est le seul connecteur obligatoire.", steps: [
      "Dans Mealie, cliquez sur votre avatar → « Jetons d'API » (« Manage your API tokens »).",
      "Donnez un nom (« Pantarr ») → « Générer », puis copiez le jeton.",
      "Dans Pantarr : « Mealie URL » = l'adresse que Pantarr peut joindre (ex. `http://mealie:9000` sur le même serveur) ; « Public Mealie URL » = l'adresse ouverte dans votre navigateur, si elle est différente.",
      "Collez le jeton, choisissez le nom de la liste de courses (elle est créée si elle n'existe pas), « Enregistrer et activer », puis « Tester » : Pantarr affiche l'utilisateur Mealie connecté.",
    ], links: [{ label: "Mealie : jetons d'API", url: "https://docs.mealie.io/documentation/getting-started/api-usage/" }] },
    en: { intro: "Mealie keeps the recipes, the meal plan and the shopping list: it is the only required connector.", steps: [
      "In Mealie, click your avatar → \"API Tokens\" (\"Manage your API tokens\").",
      "Give a name (\"Pantarr\") → \"Generate\", then copy the token.",
      "In Pantarr: \"Mealie URL\" = the address Pantarr can reach (e.g. `http://mealie:9000` on the same server); \"Public Mealie URL\" = the address opened in your browser, if different.",
      "Paste the token, pick the name of the shopping list (created if missing), \"Save and enable\", then \"Test\": Pantarr shows the connected Mealie user.",
    ], links: [{ label: "Mealie: API tokens", url: "https://docs.mealie.io/documentation/getting-started/api-usage/" }] },
  },
  gemini: {
    fr: { intro: "Le planificateur des menus. L'offre gratuite suffit pour une famille, mais Google peut y utiliser vos demandes pour améliorer ses modèles.", steps: [
      "Ouvrez Google AI Studio avec votre compte Google → « Get API key » → « Créer une clé API ».",
      "Copiez la clé et collez-la dans « API key ».",
      "Laissez le modèle `gemini-flash-latest` et les modèles de secours proposés : ils prennent le relais quand Google est surchargé.",
      "« Enregistrer et activer », puis « Tester ». Le nombre d'appels du mois est limité dans Réglages → Foyers → Menus.",
    ], links: [{ label: "Google AI Studio : clés d'API", url: "https://aistudio.google.com/apikey" }] },
    en: { intro: "The menu planner. The free tier is enough for a family, but Google may use your requests to improve its models there.", steps: [
      "Open Google AI Studio with your Google account → \"Get API key\" → \"Create API key\".",
      "Copy the key and paste it into \"API key\".",
      "Keep the model `gemini-flash-latest` and the fallback models: they take over when Google is overloaded.",
      "\"Save and enable\", then \"Test\". The monthly number of calls is capped under Settings → Households → Menus.",
    ], links: [{ label: "Google AI Studio: API keys", url: "https://aistudio.google.com/apikey" }] },
  },
  openai: {
    fr: { intro: "Tout service qui parle comme l'API d'OpenAI : OpenAI, Mistral, ou un modèle local (Ollama, LM Studio).", steps: [
      "OpenAI : créez une clé sur platform.openai.com → « API keys » ; adresse `https://api.openai.com/v1`, modèle par exemple `gpt-4o-mini`.",
      "Mistral : clé sur console.mistral.ai → « API Keys » ; adresse `https://api.mistral.ai/v1`, modèle `mistral-small-latest`.",
      "Ollama (local, gratuit, privé) : `ollama pull qwen2.5:14b` sur la machine, adresse `http://machine:11434/v1`, sans clé. LM Studio : adresse `http://machine:1234/v1`.",
      "Laissez « JSON mode » coché si le service le permet (OpenAI, Mistral, Ollama récent).",
      "« Enregistrer et activer », puis « Tester ». Un petit modèle local fait des menus moins variés : préférez au moins 14 milliards de paramètres.",
    ], links: [{ label: "OpenAI : clés d'API", url: "https://platform.openai.com/api-keys" }, { label: "Ollama", url: "https://ollama.com" }] },
    en: { intro: "Any service speaking the OpenAI API: OpenAI, Mistral, or a local model (Ollama, LM Studio).", steps: [
      "OpenAI: create a key on platform.openai.com → \"API keys\"; address `https://api.openai.com/v1`, model e.g. `gpt-4o-mini`.",
      "Mistral: key on console.mistral.ai → \"API Keys\"; address `https://api.mistral.ai/v1`, model `mistral-small-latest`.",
      "Ollama (local, free, private): `ollama pull qwen2.5:14b` on the machine, address `http://machine:11434/v1`, no key. LM Studio: address `http://machine:1234/v1`.",
      "Keep \"JSON mode\" ticked if the service supports it (OpenAI, Mistral, recent Ollama).",
      "\"Save and enable\", then \"Test\". A small local model plans less varied menus: prefer 14 billion parameters or more.",
    ], links: [{ label: "OpenAI: API keys", url: "https://platform.openai.com/api-keys" }, { label: "Ollama", url: "https://ollama.com" }] },
  },
  caldav: {
    fr: { intro: "Lit les agendas pour savoir qui mange à la maison.", steps: [
      "iCloud : sur appleid.apple.com → « Connexion et sécurité » → « Mots de passe pour applications » → créez-en un pour « Pantarr ».",
      "iCloud, dans Pantarr : adresse `https://caldav.icloud.com`, utilisateur = votre identifiant Apple (adresse e-mail), mot de passe = celui créé à l'étape 1.",
      NEXTCLOUD.fr,
      "« Calendars » : noms des agendas à lire séparés par des virgules (vide = tous), par exemple `Famille, Travail`.",
      "« Enregistrer et activer », puis « Tester » : la liste des agendas trouvés s'affiche.",
    ], links: [{ label: "Apple : mots de passe pour applications", url: "https://support.apple.com/fr-fr/102654" }] },
    en: { intro: "Reads the calendars to know who eats at home.", steps: [
      "iCloud: on appleid.apple.com → \"Sign-In and Security\" → \"App-Specific Passwords\" → create one for \"Pantarr\".",
      "iCloud, in Pantarr: address `https://caldav.icloud.com`, user = your Apple ID (e-mail), password = the one from step 1.",
      NEXTCLOUD.en,
      "\"Calendars\": names of the calendars to read, comma separated (empty = all), e.g. `Family, Work`.",
      "\"Save and enable\", then \"Test\": the calendars found are listed.",
    ], links: [{ label: "Apple: app-specific passwords", url: "https://support.apple.com/en-us/102654" }] },
  },
  ics: {
    fr: { intro: "La façon la plus simple de lire un agenda : son adresse secrète au format iCal, en lecture seule.", steps: [
      "Google Agenda (sur ordinateur) : ⚙ Paramètres → cliquez sur l'agenda à gauche → « Intégrer l'agenda » → copiez l'« Adresse secrète au format iCal ».",
      "Outlook.com : ⚙ Paramètres → Calendrier → « Calendriers partagés » → « Publier un calendrier » → choisissez l'agenda et « Peut afficher tous les détails » → copiez le lien ICS.",
      "iCloud : app Calendrier → (i) à côté de l'agenda → « Calendrier public » → copiez le lien (`webcal://` accepté).",
      "Collez l'adresse dans « ICS URL », donnez un nom parlant (« Famille »), « Enregistrer et activer », puis « Tester ».",
      "Une adresse secrète donne accès à l'agenda à qui la connaît : ne la partagez pas.",
    ] },
    en: { intro: "The simplest way to read a calendar: its secret address in iCal format, read only.", steps: [
      "Google Calendar (on a computer): ⚙ Settings → click the calendar on the left → \"Integrate calendar\" → copy the \"Secret address in iCal format\".",
      "Outlook.com: ⚙ Settings → Calendar → \"Shared calendars\" → \"Publish a calendar\" → pick the calendar and \"Can view all details\" → copy the ICS link.",
      "iCloud: Calendar app → (i) next to the calendar → \"Public Calendar\" → copy the link (`webcal://` accepted).",
      "Paste the address into \"ICS URL\", give a clear name (\"Family\"), \"Save and enable\", then \"Test\".",
      "A secret address gives access to whoever knows it: do not share it.",
    ] },
  },
  "home-assistant": {
    fr: { intro: "Les agendas déjà présents dans Home Assistant (Google, CalDAV, locaux…).", steps: [
      HA_TOKEN.fr,
      "Dans Home Assistant, Paramètres → Appareils et services → Entités : cherchez `calendar.` pour trouver les noms des agendas.",
      "Dans Pantarr : adresse de Home Assistant (ex. `http://homeassistant.local:8123`), le jeton, et les entités séparées par des virgules (`calendar.famille, calendar.travail`).",
      "« Enregistrer et activer », puis « Tester » : les événements des 7 prochains jours sont comptés.",
    ] },
    en: { intro: "The calendars already in Home Assistant (Google, CalDAV, local…).", steps: [
      HA_TOKEN.en,
      "In Home Assistant, Settings → Devices & services → Entities: search `calendar.` to find the calendar names.",
      "In Pantarr: Home Assistant address (e.g. `http://homeassistant.local:8123`), the token, and the entities comma separated (`calendar.family, calendar.work`).",
      "\"Save and enable\", then \"Test\": the events of the next 7 days are counted.",
    ] },
  },
  "google-calendar": {
    fr: { intro: "Vos agendas Google en lecture seule, sans adresse secrète. Demande de créer une fois un « client OAuth » chez Google (10 minutes).",
      steps: [...GOOGLE_CLIENT.fr, ...PANTARR_OAUTH("Google").fr, "« Calendars » : noms des agendas à lire (vide = l'agenda principal)."],
      links: [{ label: "Console Google Cloud", url: "https://console.cloud.google.com/" }] },
    en: { intro: "Your Google calendars, read only, without a secret address. Needs a one-time \"OAuth client\" at Google (10 minutes).",
      steps: [...GOOGLE_CLIENT.en, ...PANTARR_OAUTH("Google").en, "\"Calendars\": names of the calendars to read (empty = the main calendar)."],
      links: [{ label: "Google Cloud console", url: "https://console.cloud.google.com/" }] },
  },
  "microsoft-calendar": {
    fr: { intro: "Agendas Outlook.com ou Microsoft 365 en lecture seule. Demande d'inscrire une fois une application chez Microsoft (10 minutes).",
      steps: [...MS_CLIENT("Calendars.Read").fr, "Dans Pantarr, « Tenant » : `common` pour un compte personnel, sinon l'ID d'annuaire de l'organisation.", ...PANTARR_OAUTH("Microsoft").fr],
      links: [{ label: "Microsoft Entra : inscriptions d'applications", url: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" }] },
    en: { intro: "Outlook.com or Microsoft 365 calendars, read only. Needs a one-time app registration at Microsoft (10 minutes).",
      steps: [...MS_CLIENT("Calendars.Read").en, "In Pantarr, \"Tenant\": `common` for a personal account, else the directory ID of the organisation.", ...PANTARR_OAUTH("Microsoft").en],
      links: [{ label: "Microsoft Entra: app registrations", url: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" }] },
  },
  "microsoft-todo": {
    fr: { intro: "Une liste Microsoft To Do synchronisée avec la liste de courses dans les deux sens (ajouts de là-bas, articles cochés).",
      steps: ["Dans Microsoft To Do, créez une liste, par exemple « Courses ».", ...MS_CLIENT("Tasks.ReadWrite").fr,
        "Dans Pantarr, « Tenant » : `common` pour un compte personnel ; « List name » : le nom de la liste.", ...PANTARR_OAUTH("Microsoft").fr,
        "La synchronisation a lieu toutes les 10 minutes et à l'ouverture de la page Courses."],
      links: [{ label: "Microsoft Entra : inscriptions d'applications", url: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" }] },
    en: { intro: "A Microsoft To Do list synced with the shopping list both ways (items added there, checked items).",
      steps: ["In Microsoft To Do, create a list, e.g. \"Groceries\".", ...MS_CLIENT("Tasks.ReadWrite").en,
        "In Pantarr, \"Tenant\": `common` for a personal account; \"List name\": the name of the list.", ...PANTARR_OAUTH("Microsoft").en,
        "The sync runs every 10 minutes and when the Shopping page opens."],
      links: [{ label: "Microsoft Entra: app registrations", url: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" }] },
  },
  todoist: {
    fr: { intro: "Un projet Todoist servant de liste de courses, synchronisé dans les deux sens.", steps: [
      "Dans Todoist, créez un projet « Courses » (ou utilisez un projet existant).",
      "Todoist sur le web : ⚙ Paramètres → « Intégrations » → onglet « Développeur » → copiez le « Jeton API ».",
      "Dans Pantarr : collez le jeton, indiquez le nom exact du projet, « Enregistrer et activer », puis « Tester ».",
      "Les articles ajoutés dans le projet arrivent dans la liste de courses ; cocher d'un côté coche de l'autre (synchronisation toutes les 10 minutes et à l'ouverture de la page Courses).",
    ], links: [{ label: "Todoist : jeton API", url: "https://app.todoist.com/app/settings/integrations/developer" }] },
    en: { intro: "A Todoist project used as shopping list, synced both ways.", steps: [
      "In Todoist, create a \"Groceries\" project (or use an existing one).",
      "Todoist on the web: ⚙ Settings → \"Integrations\" → \"Developer\" tab → copy the \"API token\".",
      "In Pantarr: paste the token, type the exact project name, \"Save and enable\", then \"Test\".",
      "Items added to the project reach the shopping list; checking on one side checks the other (sync every 10 minutes and when the Shopping page opens).",
    ], links: [{ label: "Todoist: API token", url: "https://app.todoist.com/app/settings/integrations/developer" }] },
  },
  paperless: {
    fr: { intro: "Facultatif, recommandé : les tickets et factures archivés dans Paperless nourrissent l'historique d'achats (prévision du stock).", steps: [
      "Dans Paperless-ngx, menu de votre compte (en haut à droite) → « Mon profil » → « Jeton d'authentification API » → générez-le et copiez-le.",
      "Dans Pantarr : adresse de Paperless (celle que Pantarr peut joindre, ex. `http://paperless:8000`) et le jeton.",
      "« Enregistrer et activer », puis « Tester ».",
      "Dans Paperless, rangez les tickets de chaque magasin sous un correspondant (« Intermarché », « Leclerc »…) : les connecteurs d'achats lisent par correspondant.",
    ], links: [{ label: "Paperless-ngx : API", url: "https://docs.paperless-ngx.com/api/" }] },
    en: { intro: "Optional, recommended: receipts and invoices archived in Paperless feed the purchase history (pantry forecast).", steps: [
      "In Paperless-ngx, your account menu (top right) → \"My Profile\" → \"API Auth Token\" → generate and copy it.",
      "In Pantarr: Paperless address (the one Pantarr can reach, e.g. `http://paperless:8000`) and the token.",
      "\"Save and enable\", then \"Test\".",
      "In Paperless, file the receipts of each store under a correspondent (\"Intermarché\", \"Leclerc\"…): purchase connectors read per correspondent.",
    ], links: [{ label: "Paperless-ngx: API", url: "https://docs.paperless-ngx.com/api/" }] },
  },
  "intermarche-purchases": {
    fr: { intro: "Lit vos factures drive et tickets Intermarché archivés dans Paperless.", steps: [
      "Activez d'abord le connecteur Paperless-ngx.",
      "Dans Paperless, faites arriver les factures drive (règle de courrier sur l'adresse qui les reçoit) et les tickets scannés, avec le correspondant « Intermarché ».",
      "Dans Pantarr, gardez « Intermarché » comme correspondant (ou le nom exact utilisé dans Paperless), « Enregistrer et activer ».",
      "Page Stock → « Importer les achats » : la première importation lit tout l'historique.",
    ] },
    en: { intro: "Reads your Intermarché drive invoices and receipts archived in Paperless.", steps: [
      "Enable the Paperless-ngx connector first.",
      "In Paperless, bring in the drive invoices (mail rule on the address receiving them) and the scanned receipts, with the correspondent \"Intermarché\".",
      "In Pantarr, keep \"Intermarché\" as correspondent (or the exact name used in Paperless), \"Save and enable\".",
      "Pantry page → \"Import the purchases\": the first import reads the whole history.",
    ] },
  },
  "intermarche-cart": {
    fr: { intro: "Remplit votre panier sur intermarche.com depuis la liste de courses « Au drive ». Le créneau et le paiement restent à faire vous-même.", steps: [
      "Installez l'extension Tampermonkey dans votre navigateur (Chrome, Firefox, Edge, Safari).",
      "Dans Pantarr : Mon compte → « Script du navigateur (drive) » → installez le script proposé (Tampermonkey l'ouvre).",
      "Sur intermarche.com, connectez-vous et choisissez votre magasin.",
      "Dans Pantarr, page Courses → menu « … » → « Envoyer à Intermarché » : le site s'ouvre avec le panneau Pantarr qui ajoute les produits habituels ; vérifiez les choix proposés.",
    ], links: [{ label: "Tampermonkey", url: "https://www.tampermonkey.net/" }] },
    en: { intro: "Fills your basket on intermarche.com from the \"Online\" shopping list. Slot and payment stay with you.", steps: [
      "Install the Tampermonkey extension in your browser (Chrome, Firefox, Edge, Safari).",
      "In Pantarr: My account → \"Browser bridge (online stores)\" → install the script offered (Tampermonkey opens it).",
      "On intermarche.com, sign in and pick your store.",
      "In Pantarr, Shopping page → \"…\" menu → \"Send to Intermarché\": the site opens with the Pantarr panel adding the usual products; check the choices offered.",
    ], links: [{ label: "Tampermonkey", url: "https://www.tampermonkey.net/" }] },
  },
  "generic-receipts": {
    fr: { intro: "Lit les tickets de n'importe quel magasin archivés dans Paperless (Leclerc, Lidl, marché…).", steps: [
      "Activez d'abord le connecteur Paperless-ngx, et rangez chaque ticket sous le correspondant du magasin.",
      "Dans Pantarr, « Stores » : les correspondants à lire, séparés par des virgules (`Leclerc, Lidl`).",
      "« Channel » : `in-store` pour des tickets de magasin, `online` pour des factures de drive.",
      "« Enregistrer et activer », puis page Stock → « Importer les achats ».",
    ] },
    en: { intro: "Reads the receipts of any store archived in Paperless (Tesco, Lidl, a market…).", steps: [
      "Enable the Paperless-ngx connector first, and file each receipt under the store's correspondent.",
      "In Pantarr, \"Stores\": the correspondents to read, comma separated (`Tesco, Lidl`).",
      "\"Channel\": `in-store` for shop receipts, `online` for delivery invoices.",
      "\"Save and enable\", then Pantry page → \"Import the purchases\".",
    ] },
  },
  "google-keep": {
    fr: { intro: "Une note-liste Google Keep synchronisée avec la liste de courses (Google Assistant y ajoute). Keep n'a pas d'API publique : il faut le petit conteneur compagnon et un « master token ».", steps: [
      "Sur le serveur de Pantarr, démarrez le compagnon : `docker compose --profile keep up -d`.",
      "Obtenez un jeton : sur un ordinateur, ouvrez https://accounts.google.com/EmbeddedSetup, connectez-vous, puis dans les outils de développement (F12) → Application → Cookies, copiez la valeur du cookie `oauth_token`.",
      "Échangez-le contre un master token : `pip install gpsoauth` puis `python3 -c \"import gpsoauth;print(gpsoauth.exchange_token('vous@gmail.com','OAUTH_TOKEN','0123456789abcdef')['Token'])\"` → une valeur qui commence par `aas_et/`.",
      "Dans Pantarr : votre adresse Google, le master token, le nom de la liste Keep (« Courses »), et l'adresse du compagnon (par défaut `http://pantarr-keep:8080`).",
      "« Enregistrer et activer », puis « Tester ». Le master token donne un large accès au compte : il reste chiffré dans Pantarr.",
    ], links: [{ label: "gkeepapi", url: "https://github.com/kiwiz/gkeepapi" }] },
    en: { intro: "A Google Keep list note synced with the shopping list (Google Assistant adds to it). Keep has no public API: it needs the small companion container and a \"master token\".", steps: [
      "On the Pantarr server, start the companion: `docker compose --profile keep up -d`.",
      "Get a token: on a computer, open https://accounts.google.com/EmbeddedSetup, sign in, then in the developer tools (F12) → Application → Cookies, copy the value of the `oauth_token` cookie.",
      "Exchange it for a master token: `pip install gpsoauth` then `python3 -c \"import gpsoauth;print(gpsoauth.exchange_token('you@gmail.com','OAUTH_TOKEN','0123456789abcdef')['Token'])\"` → a value starting with `aas_et/`.",
      "In Pantarr: your Google address, the master token, the Keep list name (\"Groceries\"), and the companion address (default `http://pantarr-keep:8080`).",
      "\"Save and enable\", then \"Test\". The master token gives wide access to the account: it stays encrypted in Pantarr.",
    ], links: [{ label: "gkeepapi", url: "https://github.com/kiwiz/gkeepapi" }] },
  },
  "home-assistant-todo": {
    fr: { intro: "Une liste de tâches de Home Assistant (liste de courses locale, Bring!, OurGroceries…) ; « Ok Nabu, ajoute du lait » y ajoute.", steps: [
      HA_TOKEN.fr,
      "Trouvez l'entité de la liste : Paramètres → Appareils et services → Entités, cherchez `todo.` (la liste de courses intégrée est `todo.shopping_list`).",
      "Dans Pantarr : adresse de Home Assistant, le jeton et l'entité, « Enregistrer et activer », puis « Tester ».",
    ] },
    en: { intro: "A Home Assistant to-do list (local shopping list, Bring!, OurGroceries…); \"Hey Nabu, add milk\" adds to it.", steps: [
      HA_TOKEN.en,
      "Find the list entity: Settings → Devices & services → Entities, search `todo.` (the built-in shopping list is `todo.shopping_list`).",
      "In Pantarr: Home Assistant address, the token and the entity, \"Save and enable\", then \"Test\".",
    ] },
  },
  "caldav-tasks": {
    fr: { intro: "Une liste de tâches CalDAV (Nextcloud Tasks, Thunderbird, Fastmail). Les Rappels d'Apple ne passent plus par CalDAV : utilisez le connecteur Raccourcis.", steps: [
      "Créez une liste de tâches « Courses » dans votre application (Nextcloud Tasks, Thunderbird…).",
      NEXTCLOUD.fr,
      "Fastmail : adresse `https://caldav.fastmail.com`, et un mot de passe d'application (Paramètres → Confidentialité et sécurité → Intégrations).",
      "« Task list » : le nom exact de la liste ; « Enregistrer et activer », puis « Tester ».",
    ] },
    en: { intro: "A CalDAV task list (Nextcloud Tasks, Thunderbird, Fastmail). Apple Reminders no longer use CalDAV: use the Shortcuts connector.", steps: [
      "Create a \"Groceries\" task list in your app (Nextcloud Tasks, Thunderbird…).",
      NEXTCLOUD.en,
      "Fastmail: address `https://caldav.fastmail.com`, and an app password (Settings → Privacy & Security → Integrations).",
      "\"Task list\": the exact name of the list; \"Save and enable\", then \"Test\".",
    ] },
  },
  "apple-shortcuts": {
    fr: { intro: "« Dis Siri, courses » : un Raccourci envoie ce que vous dictez à la liste de courses. Fonctionne aussi avec Tasker ou HTTP Shortcuts sur Android.", steps: [
      "Activez ce connecteur (il n'a pas de réglage).",
      "Dans Pantarr : Mon compte → « Assistants vocaux » : vous y trouvez l'adresse à appeler et la clé à créer.",
      "Sur l'iPhone, app Raccourcis → « + » : action « Dicter le texte », puis « Obtenir le contenu de l'URL » (adresse de Pantarr, méthode POST, en-tête `Authorization: Bearer <clé>`, corps JSON avec `text` = Texte dicté).",
      "Nommez le raccourci « Courses » : « Dis Siri, courses », puis dictez « lait et œufs ».",
    ] },
    en: { intro: "\"Hey Siri, groceries\": a Shortcut sends what you dictate to the shopping list. Also works with Tasker or HTTP Shortcuts on Android.", steps: [
      "Enable this connector (it has no settings).",
      "In Pantarr: My account → \"Voice assistants\": the address to call and the key to create are there.",
      "On the iPhone, Shortcuts app → \"+\": action \"Dictate Text\", then \"Get Contents of URL\" (Pantarr address, method POST, header `Authorization: Bearer <key>`, JSON body with `text` = Dictated Text).",
      "Name the shortcut \"Groceries\": \"Hey Siri, groceries\", then dictate \"milk and eggs\".",
    ] },
  },
  "lidl-plus": {
    fr: { intro: "Vos tickets Lidl Plus (dématérialisés) remplissent l'historique d'achats, avec le détail des articles. Lidl n'a pas d'API ouverte : un script dans votre navigateur lit les tickets de votre compte sur le site Lidl, avec votre session. Pantarr ne garde aucun identifiant Lidl.", steps: [
      "Dans l'appli Lidl Plus, vérifiez que vos tickets s'affichent bien (« Tickets »). Ils apparaissent aussi sur le site Lidl, dans votre compte.",
      "Installez l'extension Tampermonkey dans le navigateur de votre ordinateur (Chrome, Firefox, Edge, Safari).",
      "Dans Pantarr, activez ce connecteur, puis Mon compte → « Script du navigateur (drive) » → « Créer le lien d'installation » puis « Installer le script » en face de Lidl Plus (Tampermonkey l'ouvre).",
      "Page Stock → « Importer depuis Lidl Plus » : le site Lidl s'ouvre ; connectez-vous à votre compte Lidl (le même que l'appli) si besoin, puis recliquez sur le bouton dans Pantarr.",
      "La première fois, le script envoie les tickets de l'année écoulée ; ensuite, il envoie les nouveaux à chaque visite du site Lidl (au plus toutes les 6 heures). Un petit message en bas à droite dit combien.",
      "Les tickets apparaissent dans Stock → Tickets et factures (« Lidl Plus »), avec leurs articles.",
    ], links: [{ label: "Tampermonkey", url: "https://www.tampermonkey.net/" }, { label: "Lidl", url: "https://www.lidl.fr/" }] },
    en: { intro: "Your Lidl Plus digital receipts fill the purchase history, item by item. Lidl has no open API: a script in your browser reads the receipts of your account on the Lidl website, with your own session. Pantarr keeps no Lidl login.", steps: [
      "In the Lidl Plus app, check that your receipts show (\"Receipts\"). They also show on the Lidl website, in your account.",
      "Install the Tampermonkey extension in your computer's browser (Chrome, Firefox, Edge, Safari).",
      "In Pantarr, enable this connector, then My account → \"Browser bridge (online stores)\" → \"Create the install link\" then \"Install the script\" next to Lidl Plus (Tampermonkey opens it).",
      "Pantry page → \"Import from Lidl Plus\": the Lidl website opens; sign in to your Lidl account (the app's one) if needed, then click the button in Pantarr again.",
      "The first time, the script sends the receipts of the past year; then it sends the new ones at each visit of the Lidl website (at most every 6 hours). A small message at the bottom right says how many.",
      "The receipts show in Pantry → Receipts and invoices (\"Lidl Plus\"), with their items.",
    ], links: [{ label: "Tampermonkey", url: "https://www.tampermonkey.net/" }, { label: "Lidl", url: "https://www.lidl.co.uk/" }] },
  },
  mailbox: {
    fr: { intro: "Les factures des drives et les tickets dématérialisés arrivent par mail : Pantarr relève un dossier de votre boîte et en tire les achats (page Stock → Tickets et factures). Aucun gestionnaire de documents n'est nécessaire.", steps: [
      "Gmail : créez un libellé « Pantarr », puis un filtre (Paramètres → Filtres → Créer un filtre) avec les expéditeurs de vos magasins (ex. `intermarche OR leclerc OR carrefour OR lidl`) → « Appliquer le libellé Pantarr ». Vous pouvez aussi y glisser un mail à la main.",
      "Gmail : créez un mot de passe d'application (myaccount.google.com → Sécurité → Validation en deux étapes → Mots de passe des applications). Le mot de passe habituel ne marche pas en IMAP.",
      "Dans Pantarr : serveur `imap.gmail.com`, port `993`, TLS, votre adresse, le mot de passe d'application, dossier `Pantarr`.",
      "Autres boîtes : iCloud `imap.mail.me.com` (mot de passe pour application), Orange `imap.orange.fr`, Free `imap.free.fr`, Yahoo `imap.mail.yahoo.com` (mot de passe d'application). Outlook.com n'accepte plus les mots de passe en IMAP : transférez les factures vers une autre boîte.",
      "« Senders » (facultatif) : ne garder que les mails dont l'expéditeur contient ces mots, si le dossier sert à autre chose.",
      "« Enregistrer et activer », puis « Tester ». Pantarr relève le dossier toutes les heures (les 90 derniers jours la première fois), ou tout de suite avec « Relever les mails » sur la page Stock.",
    ], links: [{ label: "Google : mots de passe des applications", url: "https://myaccount.google.com/apppasswords" }] },
    en: { intro: "Online-store invoices and digital receipts arrive by e-mail: Pantarr checks one folder of your mailbox and reads the purchases (Pantry page → Receipts and invoices). No document manager needed.", steps: [
      "Gmail: create a label \"Pantarr\", then a filter (Settings → Filters → Create a new filter) with the senders of your stores (e.g. `tesco OR lidl OR sainsburys`) → \"Apply the label Pantarr\". You can also drag a mail into it.",
      "Gmail: create an app password (myaccount.google.com → Security → 2-Step Verification → App passwords). The usual password does not work over IMAP.",
      "In Pantarr: server `imap.gmail.com`, port `993`, TLS, your address, the app password, folder `Pantarr`.",
      "Other mailboxes: iCloud `imap.mail.me.com` (app-specific password), Yahoo `imap.mail.yahoo.com` (app password), Fastmail `imap.fastmail.com`. Outlook.com no longer accepts passwords over IMAP: forward the invoices to another mailbox.",
      "\"Senders\" (optional): keep only the mails whose sender contains these words, if the folder holds other mails.",
      "\"Save and enable\", then \"Test\". Pantarr checks the folder every hour (the last 90 days the first time), or right away with \"Check the mails\" on the Pantry page.",
    ], links: [{ label: "Google: app passwords", url: "https://myaccount.google.com/apppasswords" }] },
  },
  grocy: {
    fr: { intro: "Si vous tenez votre stock dans Grocy, il passe avant l'estimation de Pantarr sur la page Stock.", steps: [
      "Dans Grocy, menu ⚙ (en haut à droite) → « Gérer les clés API » → « Ajouter » → copiez la clé.",
      "Dans Pantarr : adresse de Grocy (ex. `http://grocy:9283`) et la clé, « Enregistrer et activer », puis « Tester ».",
      "Les produits Grocy sont rattachés aux familles du Stock par leurs mots-clés : ajustez les mots-clés d'une famille si un produit n'est pas reconnu.",
    ], links: [{ label: "Grocy", url: "https://grocy.info" }] },
    en: { intro: "If you keep your stock in Grocy, it wins over Pantarr's estimate on the Pantry page.", steps: [
      "In Grocy, ⚙ menu (top right) → \"Manage API keys\" → \"Add\" → copy the key.",
      "In Pantarr: Grocy address (e.g. `http://grocy:9283`) and the key, \"Save and enable\", then \"Test\".",
      "Grocy products are matched to the pantry families by their keywords: adjust a family's keywords when a product is not recognised.",
    ], links: [{ label: "Grocy", url: "https://grocy.info" }] },
  },
};

/** The online stores sharing the learning script: same steps, the store's name and site. */
for (const st of STORES) {
  GUIDES[st.id] = {
    fr: { intro: `Remplit votre panier ${st.name} depuis la liste de courses « Au drive ». ${st.name} n'a pas d'API : le script tourne dans votre navigateur, connecté au site, et refait ce que vous faites. Le créneau et le paiement restent à faire vous-même.`, steps: [
      "Installez l'extension Tampermonkey dans votre navigateur (Chrome, Firefox, Edge, Safari ; sur Android : Firefox ou Kiwi).",
      "Dans Pantarr, activez ce connecteur, puis Mon compte → « Script du navigateur (drive) » → « Créer le lien d'installation » puis « Installer le script » en face de " + st.name + " (Tampermonkey l'ouvre).",
      `Ouvrez ${st.siteUrl}, connectez-vous et choisissez votre magasin.`,
      `Dans Pantarr, page Courses → menu « … » → « Envoyer à ${st.name} » : le site s'ouvre avec le panneau Pantarr en bas.`,
      "La première fois seulement, le panneau demande deux gestes pour apprendre le site : chercher « lait » dans la barre de recherche du site, puis ajouter un produit au panier à la main (vous pourrez le retirer).",
      "Le panneau propose ensuite un produit par article (★ = déjà acheté) : vérifiez, puis « Ajouter au panier ». Les fois suivantes, un bouton « Pantarr » en bas à droite du site rouvre le panneau.",
      "Si l'ajout échoue (le site a changé) : « Réapprendre ». Si vous préférez ajouter vous-même, le panneau ouvre la recherche de chaque article. Le bouton « Diagnostic » copie ce que le script a vu, pour corriger un problème.",
    ], links: [{ label: "Tampermonkey", url: "https://www.tampermonkey.net/" }, { label: st.name, url: st.siteUrl }] },
    en: { intro: `Fills your ${st.name} basket from the "Online" shopping list. ${st.name} has no API: the script runs in your browser, signed in on the site, and repeats what you do. Slot and payment stay with you.`, steps: [
      "Install the Tampermonkey extension in your browser (Chrome, Firefox, Edge, Safari; on Android: Firefox or Kiwi).",
      "In Pantarr, enable this connector, then My account → \"Browser bridge (online stores)\" → \"Create the install link\" then \"Install the script\" next to " + st.name + " (Tampermonkey opens it).",
      `Open ${st.siteUrl}, sign in and pick your store.`,
      `In Pantarr, Shopping page → "…" menu → "Send to ${st.name}": the site opens with the Pantarr panel at the bottom.`,
      "The first time only, the panel asks for two actions to learn the site: search \"lait\" in the site's search box, then add one product to the basket by hand (you can remove it).",
      "The panel then offers a product per item (★ = already bought): check, then \"Add to basket\". Next times, a \"Pantarr\" button at the bottom right of the site opens the panel again.",
      "If adding fails (the site changed): \"Learn again\". If you prefer to add yourself, the panel opens the search of each item. The \"Diagnostic\" button copies what the script saw, to fix a problem.",
    ], links: [{ label: "Tampermonkey", url: "https://www.tampermonkey.net/" }, { label: st.name, url: st.siteUrl }] },
  };
}

/** Self-hosted Gmail: the same Google client as the calendar, with the Gmail API. */
GUIDES.gmail = {
  fr: { intro: "Les mails de vos magasins (commandes drive, tickets dématérialisés, factures) arrivent dans les tickets de la page Stock. Seuls les expéditeurs de la liste sont lus.",
    steps: [...GOOGLE_CLIENT.fr.map((x) => x.replace("« Google Calendar API »", "« Gmail API »")), "Dans Pantarr, collez l'ID client et le code secret, puis « Se connecter avec Google ».",
      "« Magasins lus » : ajoutez au besoin un mot de l'adresse d'un autre magasin."] },
  en: { intro: "The mails of your stores (drive orders, digital receipts, invoices) land in the receipts of the Pantry page. Only the senders of the list are read.",
    steps: [...GOOGLE_CLIENT.en.map((x) => x.replace("\"Google Calendar API\"", "\"Gmail API\"")), "In Pantarr, paste the client ID and secret, then \"Connect with Google\".",
      "\"Stores read\": add a word of another store's address if needed."] },
};

const PROVIDER = { google: "Google", microsoft: "Microsoft", todoist: "Todoist" };
const AFTER: Record<string, Record<"fr" | "en", string>> = {
  "google-calendar": { fr: "Ensuite, « Configurer » → « Agendas » : noms des agendas à lire (vide = votre agenda principal).", en: "Then \"Configure\" → \"Calendars\": names of the calendars to read (empty = your main calendar)." },
  "microsoft-calendar": { fr: "Ensuite, « Configurer » → « Agendas » : noms des agendas à lire (vide = votre agenda principal).", en: "Then \"Configure\" → \"Calendars\": names of the calendars to read (empty = your main calendar)." },
  "microsoft-todo": { fr: "Créez d'abord dans To Do une liste « Courses » (ou indiquez son nom dans « Configurer »).", en: "First create a \"Groceries\" list in To Do (or give its name in \"Configure\")." },
  todoist: { fr: "Créez d'abord dans Todoist un projet « Courses » (ou indiquez son nom dans « Configurer »).", en: "First create a \"Groceries\" project in Todoist (or give its name in \"Configure\")." },
  gmail: { fr: "Seuls les mails des magasins de la liste sont lus (« Configurer » pour en ajouter). Pantarr relève toutes les heures, les 90 derniers jours la première fois.",
    en: "Only the mails of the stores of the list are read (\"Configure\" to add one). Pantarr checks every hour, the last 90 days the first time." },
};

/** Guide when the instance has its own client: one button. */
export function oneClickGuide(id: string, provider: "google" | "microsoft" | "todoist", locale: string): ConnectorGuide {
  const lang = locale.slice(0, 2) === "fr" ? "fr" : "en", name = PROVIDER[provider];
  const fr = [`Cliquez sur « Se connecter avec ${name} », choisissez votre compte et acceptez : c'est tout.`,
    ...(provider === "google" ? ["Si Google affiche « Google n'a pas validé cette application » (version bêta), cliquez sur « Paramètres avancés » puis « Accéder à Pantarr »."] : []),
    ...(AFTER[id] ? [AFTER[id].fr] : []), `Pour arrêter : « Déconnecter » ; Pantarr oublie l'accès${provider === "google" ? " et Google le retire" : ""}.`];
  const en = [`Click "Connect with ${name}", pick your account and accept: that's all.`,
    ...(provider === "google" ? ["If Google shows \"Google hasn't verified this app\" (beta), click \"Advanced\" then \"Go to Pantarr\"."] : []),
    ...(AFTER[id] ? [AFTER[id].en] : []), `To stop: "Disconnect"; Pantarr forgets the access${provider === "google" ? " and Google removes it" : ""}.`];
  return { steps: lang === "fr" ? fr : en };
}

/** Guide of a connector in a language (English otherwise), addresses filled in ; a plugin's own guide first. */
export function guideFor(id: string, locale: string, own?: Record<string, ConnectorGuide>): ConnectorGuide | undefined {
  const lang = locale.slice(0, 2) === "fr" ? "fr" : "en";
  const g = own?.[lang] ?? own?.en ?? GUIDES[id]?.[lang];
  if (!g) return undefined;
  const fill = (s: string) => s.replace(/\{redirect\}/g, redirectUri()).replace(/\{base\}/g, config.baseUrl);
  return { intro: g.intro && fill(g.intro), steps: g.steps.map(fill), links: g.links };
}
