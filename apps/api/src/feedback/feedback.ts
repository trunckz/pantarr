// Tickets written in the app (« Report a problem » / « Suggest an idea »): the server opens them on the project's GitHub
// repository with its own token, so that a user without a GitHub account (hosted) can report in one click. The ticket
// is public: no account, household or address is added, and what looks like an e-mail address or a phone number in the
// text is masked.
import { config } from "../config";
import { AppError } from "../i18n/i18n";

export type FeedbackKind = "bug" | "feature";

export interface FeedbackInput {
  kind: FeedbackKind; title: string; description: string; area?: string;
  page?: string; browser?: string; extension?: string;
}

/** owner/repo of a https://github.com/owner/repo address, or null. */
export function githubRepo(url: string): string | null {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** The form is offered when the instance has a token for a GitHub repository. */
export function feedbackFormEnabled(): boolean {
  return !!config.issuesToken && !!githubRepo(config.issuesUrl);
}

/** Masks e-mail addresses and phone numbers (a user may paste a receipt or a mail). */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]")
    .replace(/(?<![\w-])(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?){3,5}\d{2,4}(?![\w-])/g, (m) => (m.replace(/\D/g, "").length >= 9 ? "[phone]" : m));
}

const clean = (s: string | undefined, max: number) => scrub(String(s ?? "").replace(/\r/g, "").trim()).slice(0, max);
// a value shown inline in the ticket: one line, no Markdown that could hide or link something
const inline = (s: string | undefined, max: number) => clean(s, max).replace(/[\n`*_[\]<>|]/g, " ").replace(/\s+/g, " ").trim() || "—";

/** Title, Markdown body and labels of the GitHub ticket. */
export function issueOf(input: FeedbackInput): { title: string; body: string; labels: string[] } {
  const bug = input.kind === "bug";
  const title = `${bug ? "[Bug]" : "[Idea]"} ${inline(input.title, 120)}`;
  const body = [
    `### ${bug ? "What happened? · Que s'est-il passé ?" : "Your idea · Votre idée"}`,
    "",
    clean(input.description, 5000),
    "",
    "### Area · Partie concernée", "", inline(input.area, 100), "",
    "### Pantarr version · Version", "", inline(config.version, 20), "",
    "### Instance", "", config.mode, "",
    ...(bug ? ["### Page", "", inline(input.page?.split(/[?#]/)[0], 100), "",
               "### Browser, device · Navigateur, appareil", "", inline(input.browser, 60), "",
               "### Extension version (if used) · Version de l'extension (si utilisée)", "", inline(input.extension, 20), ""] : []),
    "---",
    "_Sent from the app by a user · Envoyé depuis l'application par un utilisateur._",
  ].join("\n");
  return { title, body, labels: [bug ? "bug" : "enhancement", "triage", "from-app"] };
}

/** Opens the ticket ; its number and public address. */
export async function openIssue(input: FeedbackInput): Promise<{ number: number; url: string }> {
  const repo = githubRepo(config.issuesUrl);
  if (!config.issuesToken || !repo) throw new AppError(503, "feedback.unavailable");
  const r = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${config.issuesToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
               "Content-Type": "application/json", "User-Agent": "Pantarr" },
    body: JSON.stringify(issueOf(input)),
  }).catch(() => null);
  if (!r?.ok) throw new AppError(502, "feedback.failed");
  const j = (await r.json()) as { number: number; html_url: string };
  return { number: j.number, url: j.html_url };
}
