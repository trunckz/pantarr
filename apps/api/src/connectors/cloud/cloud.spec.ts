import type { ConnectorContext } from "@pantarr/connector-sdk";
import { BUILT_IN } from "../registry";
import { guideFor } from "../guides";
import { config } from "../../config";
import { accountOf, authorizeUrl, exchangeCode, makeState, readState, redirectUri } from "../oauth/oauth";
import { presentManifest } from "../registry";
import { gmailConnector, gmailQuery } from "../gmail/gmail.connector";
import { googleCalendarConnector, microsoftTodoConnector, todoistConnector } from "./cloud.connectors";

/** A fetch answering by address (the token endpoint of Google / Microsoft included). */
function fake(routes: Record<string, unknown>, calls: { url: string; method: string; body?: string }[] = []) {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
    if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), { status: 200 });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response("{}", { status: 404 });
    return routes[key] === null ? new Response(null, { status: 204 }) : new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as typeof fetch;
}
const ctx = (settings: Record<string, unknown>, f: typeof fetch): ConnectorContext => ({ settings, locale: "fr", log: () => undefined, fetch: f });

describe("help of the connectors", () => {
  it("gives every built-in connector a guide in French and English", () => {
    for (const m of BUILT_IN) {
      for (const lang of ["fr", "en"]) expect({ id: m.id, steps: guideFor(m.id, lang)?.steps.length ?? 0 }).toEqual({ id: m.id, steps: expect.any(Number) });
      expect(guideFor(m.id, "fr")!.steps.length).toBeGreaterThan(2);
    }
  });
  it("fills in the address to declare at Google and Microsoft", () => {
    expect(guideFor("google-calendar", "fr-FR,fr;q=0.9")!.steps.join(" ")).toContain(redirectUri());
    expect(guideFor("microsoft-todo", "en")!.steps.join(" ")).not.toContain("{redirect}");
  });
});

describe("sign-in with Google / Microsoft", () => {
  it("keeps the household and connector in an encrypted state that expires", () => {
    const s = makeState("h1", "google-calendar", "u1", "nonce");
    expect(readState(s)).toEqual({ h: "h1", m: "google-calendar", u: "u1", n: "nonce" });
    expect(readState("forged")).toBeNull();
  });
  it("asks Google for offline, read-only access to the calendars", () => {
    const u = new URL(authorizeUrl("google", "google-calendar", { clientId: "cid" }, "st"));
    expect(u.host).toBe("accounts.google.com");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ client_id: "cid", access_type: "offline", prompt: "consent", redirect_uri: redirectUri(),
      scope: "openid email https://www.googleapis.com/auth/calendar.readonly" });
  });
  it("uses the tenant of a Microsoft account", () => {
    expect(authorizeUrl("microsoft", "microsoft-todo", { clientId: "cid", tenant: "common" }, "st")).toContain("login.microsoftonline.com/common/oauth2/v2.0/authorize");
  });
});

describe("cloud connectors", () => {
  it("reads the main Google calendar, all-day and timed events in the household's time zone", async () => {
    const f = fake({
      "/users/me/calendarList": { items: [{ id: "me@gmail.com", summary: "Moi", primary: true }, { id: "x", summary: "Autre" }] },
      "/calendars/me%40gmail.com/events": { items: [
        { summary: "Mamie", start: { dateTime: "2026-11-09T12:00:00+01:00" }, end: { dateTime: "2026-11-09T14:00:00+01:00" } },
        { summary: "Vacances", start: { date: "2026-11-10" }, end: { date: "2026-11-11" } },
        { status: "cancelled", start: { date: "2026-11-10" }, end: { date: "2026-11-11" } }] },
    });
    const e = await googleCalendarConnector.events(ctx({ refreshToken: "rt", clientId: "c", timezone: "Europe/Paris" }, f), "2026-11-09", "2026-11-16");
    expect(e).toEqual([
      { start: "2026-11-09T12:00", end: "2026-11-09T14:00", allDay: false, title: "Mamie", calendar: "Moi" },
      { start: "2026-11-10", end: "2026-11-11", allDay: true, title: "Vacances", calendar: "Moi" }]);
  });

  it("syncs a Microsoft To Do list: items and their state, checked over there", async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const f = fake({ "/me/todo/lists/L1/tasks/T1": null, "/me/todo/lists/L1/tasks": { value: [{ id: "T1", title: "Lait", status: "notStarted" }, { id: "T2", title: "Pain", status: "completed" }] },
      "/me/todo/lists": { value: [{ id: "L1", displayName: "Courses" }] } }, calls);
    const c = ctx({ refreshToken: "rt", clientId: "c", list: "courses" }, f);
    expect(await microsoftTodoConnector.pull!(c)).toEqual([{ id: "L1/T1", text: "Lait", checked: false }, { id: "L1/T2", text: "Pain", checked: true }]);
    await microsoftTodoConnector.setChecked!(c, [{ id: "L1/T1", checked: true }]);
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", body: JSON.stringify({ status: "completed" }) });
  });

  it("syncs a Todoist project, the recently completed tasks coming back as checked", async () => {
    const calls: { url: string; method: string }[] = [];
    const f = fake({ "/projects": { results: [{ id: "P1", name: "Courses" }], next_cursor: null },
      "/tasks/completed/by_completion_date": { items: [{ id: "9", content: "Beurre" }], next_cursor: null },
      "/tasks/7/close": null, "/tasks?project_id=P1": { results: [{ id: "7", content: "Œufs" }], next_cursor: null } }, calls);
    const c = ctx({ token: "t", project: "Courses" }, f);
    expect(await todoistConnector.pull!(c)).toEqual([{ id: "7", text: "Œufs", checked: false }, { id: "9", text: "Beurre", checked: true }]);
    await todoistConnector.setChecked!(c, [{ id: "7", checked: true }]);
    expect(calls.at(-1)).toMatchObject({ url: "https://api.todoist.com/api/v1/tasks/7/close", method: "POST" });
  });
});

describe("one-click connection with the instance's own clients", () => {
  const oauth = config.oauth as { google: { id: string; secret: string }; todoist: { id: string; secret: string } };
  beforeEach(() => { oauth.google = { id: "pantarr-google", secret: "s" }; oauth.todoist = { id: "pantarr-todoist", secret: "t" }; });
  afterEach(() => { oauth.google = { id: "", secret: "" }; oauth.todoist = { id: "", secret: "" }; });

  it("shows a single button: no client fields, a short guide", () => {
    const m = presentManifest(gmailConnector.manifest, "fr");
    expect(m).toMatchObject({ platformOAuth: true });
    expect(Object.keys(m.settings)).toEqual(["refreshToken", "senders", "cursor"]);
    expect(m.guide!.steps[0]).toContain("Se connecter avec Google");
    const td = presentManifest(BUILT_IN.find((x) => x.id === "todoist")!, "en");
    expect(td.settings.token).toMatchObject({ hidden: true, required: false });
  });
  it("keeps the household's own client, or Todoist's personal token, without instance clients", () => {
    oauth.google = { id: "", secret: "" }; oauth.todoist = { id: "", secret: "" };
    expect(presentManifest(gmailConnector.manifest, "fr").settings.clientId).toBeDefined();
    const td = presentManifest(BUILT_IN.find((x) => x.id === "todoist")!, "fr");
    expect(td.oauth).toBeUndefined();
    expect(td.settings.token.hidden).toBeFalsy();
  });
  it("asks the consent with the instance's client, the household's own first", () => {
    expect(new URL(authorizeUrl("google", "gmail", {}, "st")).searchParams.get("client_id")).toBe("pantarr-google");
    expect(new URL(authorizeUrl("google", "gmail", { clientId: "own" }, "st")).searchParams.get("client_id")).toBe("own");
    const td = new URL(authorizeUrl("todoist", "todoist", {}, "st"));
    expect(td.host).toBe("todoist.com");
    expect(Object.fromEntries(td.searchParams)).toMatchObject({ client_id: "pantarr-todoist", scope: "data:read_write", state: "st" });
  });
  it("keeps the refresh token and the account of Google, the lasting token of Todoist", async () => {
    const id = `x.${Buffer.from(JSON.stringify({ email: "famille@gmail.com" })).toString("base64url")}.sig`;
    const calls: { url: string; body?: string }[] = [];
    const f = (async (u: string, init?: RequestInit) => { calls.push({ url: String(u), body: String(init?.body) });
      return new Response(JSON.stringify(String(u).includes("todoist") ? { access_token: "td-token" } : { refresh_token: "rt", id_token: id }), { status: 200 }); }) as typeof fetch;
    expect(await exchangeCode("google", "gmail", {}, "code", f)).toEqual({ secrets: { refreshToken: "rt" }, account: "famille@gmail.com" });
    expect(calls[0].body).toContain("client_id=pantarr-google");
    expect(await exchangeCode("todoist", "todoist", {}, "code", f)).toEqual({ secrets: { token: "td-token" }, account: "" });
    expect(accountOf("not-a-token")).toBe("");
  });
});

describe("Gmail", () => {
  it("searches only the stores' mails, new ones after the last read", () => {
    expect(gmailQuery(["leclerc", "intermarche"], 0)).toBe("from:(leclerc OR intermarche) newer_than:90d -in:chats");
    expect(gmailQuery(["lidl"], 1762300000123)).toBe("from:(lidl) after:1762300000 -in:chats");
  });
  it("reads the oldest new mails first, their attachments or text, and moves the cursor", async () => {
    const raw = (subject: string) => Buffer.from(`From: E.Leclerc <commande@e-leclerc.com>\r\nSubject: ${subject}\r\nDate: Wed, 5 Nov 2026 10:00:00 +0100\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nVotre commande : 2 x Lait 1,05\r\n`).toString("base64url");
    const f = fake({
      "/messages?": { messages: [{ id: "new" }, { id: "old" }] },
      "/messages/new": { raw: raw("Commande 2"), internalDate: "1762340000000" },
      "/messages/old": { raw: raw("Commande 1"), internalDate: "1762330000000" },
    });
    const r = await gmailConnector.messages(ctx({ refreshToken: "rt", clientId: "c" }, f));
    expect(r.documents.map((d) => d.filename)).toEqual(["Commande 1.txt", "Commande 2.txt"]);
    expect(r.documents[0].data.toString()).toContain("2 x Lait");
    expect(r.cursor).toBe("1762340000000");
  });
});

describe("mails of the stores", () => {
  it("keeps a store's mail whatever the accents of its sender", async () => {
    const { documentsOf } = await import("../mailbox/mailbox.connector");
    const mail = (from: string) => Buffer.from(`From: ${from}\r\nSubject: Votre commande\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nx1\r\n`);
    expect(await documentsOf(mail("=?UTF-8?Q?Intermarch=C3=A9?= <drive@mousquetaires.com>"), 1, ["intermarche"])).toHaveLength(1);
    expect(await documentsOf(mail("Boulangerie <pain@example.com>"), 2, ["intermarche"])).toHaveLength(0);
  });
});
