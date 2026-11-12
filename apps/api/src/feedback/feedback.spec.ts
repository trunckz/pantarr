import { config } from "../config";
import { feedbackFormEnabled, githubRepo, issueOf, scrub } from "./feedback";

describe("tickets written in the app", () => {
  it("reads the repository of a GitHub address", () => {
    expect(githubRepo("https://github.com/trunckz/pantarr")).toBe("trunckz/pantarr");
    expect(githubRepo("https://github.com/a/b.git")).toBe("a/b");
    expect(githubRepo("https://codeberg.org/a/b")).toBeNull();
  });
  it("is offered only with a token", () => {
    const before = { ...config };
    Object.assign(config, { issuesUrl: "https://github.com/o/r", issuesToken: "" });
    expect(feedbackFormEnabled()).toBe(false);
    Object.assign(config, { issuesToken: "t" });
    expect(feedbackFormEnabled()).toBe(true);
    Object.assign(config, before);
  });
  it("masks e-mail addresses and phone numbers, not quantities or dates", () => {
    expect(scrub("écrire à jean.dupont+x@mail.fr ou au 06 12 34 56 78")).toBe("écrire à [e-mail] ou au [phone]");
    expect(scrub("+33 6 12 34 56 78")).toBe("[phone]");
    expect(scrub("2 x 500 g, le 12/11/2026, ticket 1234")).toBe("2 x 500 g, le 12/11/2026, ticket 1234");
  });
  it("builds a bug ticket with the context and no Markdown in the short fields", () => {
    const i = issueOf({ kind: "bug", title: "Liste **vide**", description: "La liste reste vide.", area: "Shopping", page: "/shopping?x=1", browser: "Firefox 133, Android" });
    expect(i.title).toBe("[Bug] Liste vide");
    expect(i.labels).toEqual(["bug", "triage", "from-app"]);
    expect(i.body).toContain("La liste reste vide.");
    expect(i.body).toContain("/shopping\n");
    expect(i.body).toContain(config.mode);
  });
  it("leaves the page and the browser out of an idea", () => {
    const i = issueOf({ kind: "feature", title: "Petit-déjeuner", description: "Ajouter chaque semaine les mêmes produits.", page: "/planning" });
    expect(i.title.startsWith("[Idea] ")).toBe(true);
    expect(i.labels[0]).toBe("enhancement");
    expect(i.body).not.toContain("/planning");
  });
});
