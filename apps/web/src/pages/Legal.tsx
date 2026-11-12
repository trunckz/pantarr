// Public pages (no sign-in): privacy policy and terms of use of this instance, in French and English. The operator and
// the contact come from the instance (PANTARR_OPERATOR_NAME, PANTARR_CONTACT_EMAIL). Required to publish the Google app.
import { Anchor, Container, Group, List, Paper, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Status } from "../api";

type Block = string | string[];
interface Section { title: string; body: Block[] }
interface Doc { title: string; intro: string; sections: Section[] }

const PRIVACY: Record<"fr" | "en", (v: Vars) => Doc> = {
  fr: (v) => ({
    title: "Politique de confidentialité",
    intro: `Cette page explique quelles données ${v.site} traite, pourquoi, avec qui elles sont partagées et comment exercer vos droits. Pantarr est un service de planification des repas et des courses, actuellement en version bêta sur invitation.`,
    sections: [
      { title: "1. Responsable du traitement", body: [`${v.operator}, particulier, France. Contact pour toute question sur vos données : ${v.contact}.`] },
      { title: "2. Données que nous traitons", body: [[
        "Compte : nom, adresse e-mail, mot de passe (enregistré uniquement sous forme hachée, Argon2), langue, date de dernière connexion.",
        "Foyer : prénoms des membres, adulte ou enfant, date de naissance si vous l'indiquez, allergies, régimes et règles alimentaires. Les allergies et régimes peuvent révéler des informations de santé ou des convictions : vous les indiquez volontairement, ils servent uniquement à composer des menus adaptés.",
        "Repas et courses : recettes, menus, listes de courses, préférences, stock, appréciations des repas.",
        "Tickets et achats : photos et PDF que vous envoyez, mails transférés à votre adresse de transfert, mails des magasins lus dans Gmail si vous le connectez, et les achats qui en sont extraits.",
        "Connecteurs : leurs réglages ; les jetons d'accès aux services tiers sont chiffrés.",
        "Données techniques : journaux du serveur (adresse IP, date, page demandée) et nombre d'appels au planificateur IA (pour les quotas).",
      ]] },
      { title: "3. Données reçues de Google", body: [
        "Uniquement si vous connectez ces services, et seulement ce qui est décrit ici :",
        [
          "« Continuer avec Google » : votre nom, votre adresse e-mail et l'identifiant de votre compte Google, pour créer votre compte Pantarr ou vous connecter.",
          "Google Agenda (lecture seule) : les événements de la période à planifier (dates et heures) sont lus au moment de préparer les menus, pour savoir qui est présent à quel repas. Seules les plages occupées sont utilisées : les titres et descriptions des événements ne sont ni conservés ni transmis au planificateur IA.",
          "Gmail (lecture seule) : seuls les messages des expéditeurs de la liste des magasins (modifiable dans le connecteur) sont recherchés et lus. Leur pièce jointe ou leur texte est enregistré dans vos tickets pour en extraire les achats, par reconnaissance de texte sur nos serveurs. Aucun autre message n'est ouvert. Rien n'est envoyé, modifié ni supprimé dans votre boîte.",
        ],
        "L'utilisation et le transfert à toute autre application des informations reçues des API Google respectent les Règles relatives aux données utilisateur des services d'API Google (https://developers.google.com/terms/api-services-user-data-policy), y compris les exigences d'utilisation limitée (Limited Use). En particulier : ces données servent uniquement aux fonctions de Pantarr que vous voyez ; elles ne sont jamais vendues, ni utilisées pour de la publicité, ni pour entraîner des modèles d'intelligence artificielle ; personne ne les lit, sauf avec votre accord, pour la sécurité ou si la loi l'exige.",
        "Vous pouvez retirer l'accès à tout moment : bouton « Déconnecter » du connecteur dans Pantarr, ou https://myaccount.google.com/permissions.",
      ] },
      { title: "4. Autres services que vous pouvez connecter", body: [
        "Microsoft (Outlook, To Do), Todoist, CalDAV, adresses d'agenda ICS : mêmes principes, lecture limitée à ce qui sert au service (agenda pour les présences, liste de courses synchronisée). Les scripts de magasins s'exécutent dans votre navigateur, avec votre propre compte du magasin, à votre demande.",
      ] },
      { title: "5. Pourquoi (finalités et bases légales)", body: [[
        "Fournir le service que vous demandez (menus, courses, tickets) : exécution du contrat (conditions d'utilisation).",
        "Allergies et régimes : votre consentement explicite, donné en cochant la case d'accord avant de les saisir (sa date est conservée) ; vous le retirez à tout moment au même endroit, et ils sont alors effacés.",
        "Sécurité, prévention des abus, quotas : intérêt légitime.",
        "Mails du service (vérification de l'adresse, invitations) : exécution du contrat.",
      ]] },
      { title: "6. Planificateur IA", body: [
        "Pour proposer des menus, Pantarr envoie au modèle d'IA Google Gemini les informations utiles : prénoms et âges des membres, allergies, régimes et règles, présences (plages occupées), recettes connues, préférences, et vos consignes. Pendant la bêta, Pantarr utilise l'offre gratuite de Gemini, dont les conditions permettent à Google d'utiliser les contenus envoyés pour améliorer ses services. Les données reçues des API Google (agenda, Gmail) n'y sont jamais envoyées. N'indiquez pas dans vos consignes ce que vous ne souhaitez pas partager.",
        "La lecture des tickets se fait par défaut sans IA (reconnaissance de texte sur nos serveurs) ; si vous choisissez la lecture par IA dans les réglages, le ticket est envoyé au modèle d'IA.",
      ] },
      { title: "7. Destinataires et sous-traitants", body: [[
        "Hébergement : serveurs de l'éditeur, en France, et leurs sauvegardes, sur des équipements de l'éditeur en France.",
        "Google : modèle d'IA Gemini (§ 6), connexion avec Google, envoi des mails du service (Gmail).",
        "Cloudflare : nom de domaine et réception des mails envoyés à votre adresse de transfert.",
        "Les services que vous connectez vous-même (§ 3 et 4), pour ce qui les concerne.",
        "Aucune donnée n'est vendue ni utilisée pour de la publicité.",
      ]] },
      { title: "8. Durée de conservation", body: [
        "Vos données sont conservées tant que votre compte existe. Les fichiers des tickets (photos, PDF, mails) sont supprimés 30 jours après leur arrivée : seules les lignes d'achat qui en sont extraites sont conservées. Quand vous supprimez votre compte, il est effacé immédiatement, ainsi que votre foyer si vous en étiez le seul membre ; les copies de sauvegarde disparaissent au fil de leur rotation (quelques semaines). Les journaux techniques sont conservés quelques semaines.",
      ] },
      { title: "9. Vos droits", body: [
        `Vous pouvez accéder à vos données, les corriger, les exporter (Mon compte → exporter), les supprimer (Mon compte → supprimer le compte), vous opposer à un traitement ou en demander la limitation, en écrivant à ${v.contact}. Vous pouvez aussi adresser une réclamation à la CNIL (https://www.cnil.fr).`,
      ] },
      { title: "10. Cookies", body: ["Pantarr n'utilise qu'un cookie de session, nécessaire pour rester connecté. Aucun cookie publicitaire ni de mesure d'audience."] },
      { title: "11. Sécurité", body: ["Connexions chiffrées (HTTPS), mots de passe hachés, jetons des services tiers chiffrés, chaque foyer cloisonné, nombre d'essais de connexion limité, serveurs à jour et sauvegardés. L'éditeur ne consulte les données d'un foyer que pour l'assistance que vous demandez ou pour la sécurité du service ; chaque consultation est enregistrée."] },
      { title: "12. Mineurs", body: ["Le compte est réservé aux adultes. Les informations sur les enfants du foyer sont saisies par leurs parents, sous leur responsabilité, pour adapter les repas."] },
      { title: "13. Modifications", body: [`Cette politique peut évoluer ; la date de mise à jour figure en bas de page. En cas de changement important, vous serez prévenu dans l'application ou par e-mail.`] },
    ],
  }),
  en: (v) => ({
    title: "Privacy policy",
    intro: `This page explains what data ${v.site} processes, why, who it is shared with and how to use your rights. Pantarr is a meal and grocery planning service, currently in invitation-only beta.`,
    sections: [
      { title: "1. Data controller", body: [`${v.operator}, individual, France. Contact for any question about your data: ${v.contact}.`] },
      { title: "2. Data we process", body: [[
        "Account: name, e-mail address, password (stored only as an Argon2 hash), language, last sign-in date.",
        "Household: first names of the members, adult or child, birth date if you give it, allergies, diets and food rules. Allergies and diets may reveal health information or beliefs: you give them voluntarily, they are used only to plan suitable meals.",
        "Meals and groceries: recipes, meal plans, shopping lists, preferences, pantry, meal feedback.",
        "Receipts and purchases: photos and PDFs you send, mails forwarded to your forwarding address, store mails read in Gmail if you connect it, and the purchases read from them.",
        "Connectors: their settings; access tokens to third-party services are encrypted.",
        "Technical data: server logs (IP address, date, page) and the number of calls to the AI planner (for quotas).",
      ]] },
      { title: "3. Data received from Google", body: [
        "Only if you connect these services, and only what is described here:",
        [
          "\"Continue with Google\": your name, e-mail address and Google account identifier, to create your Pantarr account or sign you in.",
          "Google Calendar (read-only): the events of the period being planned (dates and times) are read when the meal plan is prepared, to know who is home for which meal. Only busy time slots are used: event titles and descriptions are neither stored nor sent to the AI planner.",
          "Gmail (read-only): only messages from the senders of the store list (editable in the connector) are searched and read. Their attachment or text is saved in your receipts to read the purchases, with text recognition on our servers. No other message is opened. Nothing is sent, changed or deleted in your mailbox.",
        ],
        "Pantarr's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy (https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. In particular: this data is used only for the Pantarr features you see; it is never sold, never used for advertising, never used to train artificial intelligence models; no person reads it, except with your consent, for security, or when the law requires it.",
        "You can remove the access at any time: \"Disconnect\" on the connector in Pantarr, or https://myaccount.google.com/permissions.",
      ] },
      { title: "4. Other services you can connect", body: [
        "Microsoft (Outlook, To Do), Todoist, CalDAV, ICS calendar addresses: same principles, access limited to what the service needs (calendar for presence, synced shopping list). Store scripts run in your browser, with your own store account, when you ask.",
      ] },
      { title: "5. Purposes and legal bases", body: [[
        "Providing the service you ask for (meal plans, groceries, receipts): performance of the contract (terms of use).",
        "Allergies and diets: your explicit consent, given by ticking the consent box before entering them (its date is kept); you withdraw it at any time in the same place, and they are then erased.",
        "Security, abuse prevention, quotas: legitimate interest.",
        "Service e-mails (address check, invitations): performance of the contract.",
      ]] },
      { title: "6. AI planner", body: [
        "To suggest meal plans, Pantarr sends the Google Gemini AI model the information it needs: first names and ages of the members, allergies, diets and rules, presence (busy slots), known recipes, preferences and your instructions. During the beta, Pantarr uses Gemini's free tier, whose terms allow Google to use the content sent to improve its services. Data received from Google APIs (Calendar, Gmail) is never sent to it. Do not write in your instructions anything you do not want to share.",
        "Receipts are read without AI by default (text recognition on our servers); if you choose AI reading in the settings, the receipt is sent to the AI model.",
      ] },
      { title: "7. Recipients and processors", body: [[
        "Hosting: the operator's servers, in France, and their backups, on the operator's equipment in France.",
        "Google: Gemini AI model (§ 6), sign-in with Google, sending the service's e-mails (Gmail).",
        "Cloudflare: domain name and reception of the mails sent to your forwarding address.",
        "The services you connect yourself (§ 3 and 4), for their part.",
        "No data is sold or used for advertising.",
      ]] },
      { title: "8. Retention", body: [
        "Your data is kept as long as your account exists. Receipt files (photos, PDFs, mails) are deleted 30 days after they arrive: only the purchase lines read from them are kept. When you delete your account, it is erased at once, with your household if you were its only member; backup copies disappear as they rotate (a few weeks). Technical logs are kept a few weeks.",
      ] },
      { title: "9. Your rights", body: [
        `You can access, correct, export (My account → export), delete (My account → delete the account) your data, object to or restrict a processing, by writing to ${v.contact}. You can also complain to the French data protection authority, CNIL (https://www.cnil.fr).`,
      ] },
      { title: "10. Cookies", body: ["Pantarr uses only a session cookie, needed to stay signed in. No advertising or analytics cookie."] },
      { title: "11. Security", body: ["Encrypted connections (HTTPS), hashed passwords, encrypted third-party tokens, each household isolated, limited sign-in attempts, servers kept up to date and backed up. The operator only looks at a household's data for support you ask for or for the security of the service; every such access is recorded."] },
      { title: "12. Children", body: ["Accounts are for adults. Information about the household's children is entered by their parents, under their responsibility, to adapt the meals."] },
      { title: "13. Changes", body: ["This policy may change; the update date is at the bottom of the page. You will be told in the app or by e-mail of any important change."] },
    ],
  }),
};

const TERMS: Record<"fr" | "en", (v: Vars) => Doc> = {
  fr: (v) => ({
    title: "Conditions d'utilisation",
    intro: `Ces conditions encadrent l'utilisation de ${v.site} (Pantarr), édité par ${v.operator}. En créant un compte, vous les acceptez.`,
    sections: [
      { title: "1. Le service", body: ["Pantarr aide à planifier les repas, préparer les courses et suivre les achats d'un foyer, avec des suggestions d'un planificateur IA et des connexions facultatives à d'autres services (agendas, listes, messagerie, magasins)."] },
      { title: "2. Version bêta", body: ["Le service est en version bêta, gratuit et sur invitation. Il peut évoluer, être interrompu ou s'arrêter ; des données de test peuvent être réinitialisées après information. Aucun niveau de disponibilité n'est garanti."] },
      { title: "3. Votre compte", body: ["Vous devez être majeur, donner des informations exactes et garder votre mot de passe secret. Vous êtes responsable de ce qui est fait avec votre compte et des personnes que vous invitez dans votre foyer."] },
      { title: "4. Suggestions de l'IA : vérifiez toujours", body: ["Les menus, quantités et listes proposés sont des suggestions automatiques qui peuvent comporter des erreurs. En cas d'allergie ou de régime médical, vérifiez toujours vous-même les ingrédients et les étiquettes des produits : Pantarr ne remplace ni un avis médical ni votre vigilance."] },
      { title: "5. Usage acceptable", body: [["N'utilisez pas le service pour des activités illégales, pour nuire à d'autres utilisateurs ou à l'infrastructure, ni pour contourner les quotas ou le cloisonnement des foyers.", "N'importez que des contenus que vous avez le droit d'utiliser (recettes, photos)."]] },
      { title: "6. Vos contenus", body: ["Vos contenus (recettes, tickets, listes…) restent les vôtres. Vous nous autorisez seulement à les stocker et à les traiter pour faire fonctionner le service pour vous. Vous pouvez les exporter et les supprimer à tout moment."] },
      { title: "7. Services tiers", body: ["Les services que vous connectez (Google, Microsoft, Todoist, sites de magasins…) restent soumis à leurs propres conditions. Les scripts de magasins agissent dans votre navigateur, avec votre compte et à votre demande : respectez les conditions de ces sites."] },
      { title: "8. Responsabilité", body: ["Le service est fourni « en l'état ». Dans les limites permises par la loi, l'éditeur n'est pas responsable des dommages indirects, des pertes de données (gardez vos propres exports) ni des conséquences d'une suggestion non vérifiée."] },
      { title: "9. Suspension et fin", body: [`Vous pouvez supprimer votre compte à tout moment (Mon compte). L'éditeur peut suspendre un compte qui ne respecte pas ces conditions, ou mettre fin à la bêta en prévenant les utilisateurs.`] },
      { title: "10. Données personnelles", body: ["Voir la politique de confidentialité."] },
      { title: "11. Droit applicable", body: [`Droit français. Contact : ${v.contact}.`] },
    ],
  }),
  en: (v) => ({
    title: "Terms of use",
    intro: `These terms govern the use of ${v.site} (Pantarr), run by ${v.operator}. By creating an account, you accept them.`,
    sections: [
      { title: "1. The service", body: ["Pantarr helps a household plan meals, prepare groceries and follow purchases, with suggestions from an AI planner and optional connections to other services (calendars, lists, mail, stores)."] },
      { title: "2. Beta", body: ["The service is in beta, free and invitation-only. It may change, be interrupted or stop; test data may be reset after notice. No availability level is guaranteed."] },
      { title: "3. Your account", body: ["You must be an adult, give accurate information and keep your password secret. You are responsible for what is done with your account and for the people you invite to your household."] },
      { title: "4. AI suggestions: always check", body: ["Suggested meal plans, quantities and lists are automatic suggestions and may contain mistakes. For an allergy or a medical diet, always check the ingredients and product labels yourself: Pantarr replaces neither medical advice nor your own care."] },
      { title: "5. Acceptable use", body: [["Do not use the service for illegal activities, to harm other users or the infrastructure, or to bypass quotas or the isolation of households.", "Only import content you have the right to use (recipes, photos)."]] },
      { title: "6. Your content", body: ["Your content (recipes, receipts, lists…) stays yours. You only allow us to store and process it to run the service for you. You can export and delete it at any time."] },
      { title: "7. Third-party services", body: ["Services you connect (Google, Microsoft, Todoist, store websites…) remain under their own terms. Store scripts act in your browser, with your account and when you ask: follow those websites' terms."] },
      { title: "8. Liability", body: ["The service is provided \"as is\". To the extent permitted by law, the operator is not liable for indirect damage, data loss (keep your own exports) or the consequences of an unchecked suggestion."] },
      { title: "9. Suspension and termination", body: ["You can delete your account at any time (My account). The operator may suspend an account that breaks these terms, or end the beta after telling the users."] },
      { title: "10. Personal data", body: ["See the privacy policy."] },
      { title: "11. Governing law", body: [`French law. Contact: ${v.contact}.`] },
    ],
  }),
};

interface Vars { site: string; operator: string; contact: string }

/** Text with its addresses as links. */
function Linked({ text }: { text: string }) {
  return <>{text.split(/(https?:\/\/[^\s),]+|[\w.+-]+@[\w-]+\.[\w.]+)/g).map((p, i) => /^https?:\/\//.test(p)
    ? <Anchor key={i} href={p} target="_blank" rel="noopener">{p}</Anchor>
    : /@/.test(p) && /^[\w.+-]+@/.test(p) ? <Anchor key={i} href={`mailto:${p}`}>{p}</Anchor> : p)}</>;
}

export default function Legal({ page, status }: { page: "privacy" | "terms"; status: Status }) {
  const { i18n } = useTranslation();
  const [lang, setLang] = useState<"fr" | "en">(i18n.language.startsWith("fr") ? "fr" : "en");
  const l = status.legal;
  const vars: Vars = { site: l?.baseUrl ? new URL(l.baseUrl).host : "Pantarr", operator: l?.operator || (lang === "fr" ? "l'administrateur de cette instance" : "the administrator of this instance"),
    contact: l?.contact || (lang === "fr" ? "l'administrateur de cette instance" : "the administrator of this instance") };
  const doc = (page === "privacy" ? PRIVACY : TERMS)[lang](vars);
  const other = page === "privacy" ? "/terms" : "/privacy";
  const otherLabel = lang === "fr" ? (page === "privacy" ? "Conditions d'utilisation" : "Politique de confidentialité") : (page === "privacy" ? "Terms of use" : "Privacy policy");
  return (
    <Container size="md" py="xl">
      <Paper withBorder p={{ base: "md", sm: "xl" }}>
        <Stack gap="md">
          <Group justify="space-between">
            <Anchor href="/"><Group gap="xs"><img src="/favicon.svg" width={28} height={28} alt="" /><Text fw={700}>Pantarr</Text></Group></Anchor>
            <Group gap="xs">
              <Anchor size="sm" onClick={() => setLang("fr")} fw={lang === "fr" ? 700 : 400}>FR</Anchor>
              <Anchor size="sm" onClick={() => setLang("en")} fw={lang === "en" ? 700 : 400}>EN</Anchor>
            </Group>
          </Group>
          <Title order={1}>{doc.title}</Title>
          <Text><Linked text={doc.intro} /></Text>
          {doc.sections.map((s) => (
            <Stack key={s.title} gap={6}>
              <Title order={3}>{s.title}</Title>
              {s.body.map((b, i) => Array.isArray(b)
                ? <List key={i} spacing={4}>{b.map((x, k) => <List.Item key={k}><Linked text={x} /></List.Item>)}</List>
                : <Text key={i}><Linked text={b} /></Text>)}
            </Stack>
          ))}
          <Text size="sm" c="dimmed">{lang === "fr" ? "Mise à jour" : "Updated"} : {l?.updated ?? ""} · <Anchor href={other} size="sm">{otherLabel}</Anchor></Text>
        </Stack>
      </Paper>
    </Container>
  );
}

/** Links shown under the sign-in and sign-up forms (and required by Google on the home page). */
export function LegalLinks() {
  const { t } = useTranslation();
  return <Group justify="center" gap="md"><Anchor href="/privacy" size="xs" c="dimmed">{t("legal.privacy")}</Anchor><Anchor href="/terms" size="xs" c="dimmed">{t("legal.terms")}</Anchor></Group>;
}
