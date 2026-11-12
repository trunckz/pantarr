// Cloud accounts: Google Calendar and Outlook / Microsoft 365 calendars (who eats when), Microsoft To Do and Todoist
// (shared shopping list, synced both ways by list-sync/). All through « Connect » (OAuth, see oauth/oauth.ts); Todoist
// also with a personal API token when the instance has no Todoist client.
import type { CalendarConnector, CalendarEvent, ConnectorContext, ListItem, ListSyncConnector } from "@pantarr/connector-sdk";
import { wallClock } from "../calendar/ics";
import { apiCall } from "../oauth/oauth";

const tz = (ctx: ConnectorContext) => String(ctx.settings.timezone || "Europe/Paris");
const names = (s: unknown) => String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const oauthFields = (secretTitle: string) => ({
  clientId: { type: "string" as const, title: "Client ID (Application ID)", required: true },
  clientSecret: { type: "string" as const, title: secretTitle, secret: true, required: true },
  refreshToken: { type: "string" as const, title: "Refresh token", secret: true, hidden: true },
});

// ── Google Calendar ──
interface GEvent { status?: string; summary?: string; start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string } }
const G = "https://www.googleapis.com/calendar/v3";
const gcal = <T>(ctx: ConnectorContext, url: string) => apiCall<T>(ctx, "google", "google-calendar", url);

export const googleCalendarConnector: CalendarConnector & { test(ctx: ConnectorContext): Promise<string> } = {
  manifest: { id: "google-calendar", kind: "calendar", name: "Google Calendar", oauth: "google",
    description: "Your Google calendars, read only, through « Connect with Google ». Simpler but public: the « secret address in iCal format » of a calendar in the ICS connector.",
    settings: { ...oauthFields("Client secret"),
      calendars: { type: "string", title: "Calendars (names or IDs, comma separated)", description: "Empty: your main calendar", default: "" } } },
  async events(ctx, from, to) {
    const list = await gcal<{ items: { id: string; summary: string; primary?: boolean }[] }>(ctx, `${G}/users/me/calendarList`);
    const wanted = names(ctx.settings.calendars);
    const cals = wanted.length ? list.items.filter((c) => wanted.some((w) => same(w, c.summary) || w === c.id)) : list.items.filter((c) => c.primary);
    const out: CalendarEvent[] = [];
    for (const c of cals) {
      let page = "";
      do {
        const q = new URLSearchParams({ timeMin: `${from}T00:00:00Z`, timeMax: `${to}T00:00:00Z`, singleEvents: "true", orderBy: "startTime", maxResults: "250",
          ...(page ? { pageToken: page } : {}) });
        const r = await gcal<{ items?: GEvent[]; nextPageToken?: string }>(ctx, `${G}/calendars/${encodeURIComponent(c.id)}/events?${q}`);
        for (const e of r.items ?? []) {
          if (e.status === "cancelled") continue;
          const t = (x: GEvent["start"]) => x.date ?? wallClock(new Date(x.dateTime!), tz(ctx));
          out.push({ start: t(e.start), end: t(e.end), allDay: !!e.start.date, title: e.summary ?? "", calendar: c.summary });
        }
        page = r.nextPageToken ?? "";
      } while (page);
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  },
  async test(ctx) {
    const list = await gcal<{ items: { summary: string; primary?: boolean }[] }>(ctx, `${G}/users/me/calendarList`);
    return `${list.items.length} calendars: ${list.items.map((c) => c.summary + (c.primary ? " (main)" : "")).join(", ")}`;
  },
};

// ── Microsoft Graph: Outlook calendars and To Do ──
const GRAPH = "https://graph.microsoft.com/v1.0";
async function graphAll<T>(ctx: ConnectorContext, moduleId: string, url: string, headers: Record<string, string> = {}): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = url;
  while (next) {
    const r: { value: T[]; "@odata.nextLink"?: string } = await apiCall(ctx, "microsoft", moduleId, next, { headers });
    out.push(...r.value);
    next = r["@odata.nextLink"];
  }
  return out;
}
const msFields = { tenant: { type: "string" as const, title: "Tenant", description: "« common » for a personal account (outlook.com, hotmail…), else the ID of your organisation", default: "common" },
  ...oauthFields("Client secret (value)") };

interface MEvent { subject?: string; isAllDay?: boolean; isCancelled?: boolean; start: { dateTime: string }; end: { dateTime: string } }

export const microsoftCalendarConnector: CalendarConnector & { test(ctx: ConnectorContext): Promise<string> } = {
  manifest: { id: "microsoft-calendar", kind: "calendar", name: "Outlook / Microsoft 365", oauth: "microsoft",
    description: "Outlook.com or Microsoft 365 calendars, read only, through « Connect with Microsoft ».",
    settings: { ...msFields, calendars: { type: "string", title: "Calendars (names, comma separated)", description: "Empty: your main calendar", default: "" } } },
  async events(ctx, from, to) {
    const id = "microsoft-calendar";
    const wanted = names(ctx.settings.calendars);
    const cals = wanted.length
      ? (await graphAll<{ id: string; name: string }>(ctx, id, `${GRAPH}/me/calendars?$select=id,name`)).filter((c) => wanted.some((w) => same(w, c.name)))
      : [{ id: "", name: "Calendar" }];
    const out: CalendarEvent[] = [];
    for (const c of cals) {
      const q = new URLSearchParams({ startDateTime: `${from}T00:00:00Z`, endDateTime: `${to}T00:00:00Z`, $top: "200", $select: "subject,start,end,isAllDay,isCancelled" });
      const path = c.id ? `/me/calendars/${encodeURIComponent(c.id)}/calendarView` : "/me/calendarView";
      for (const e of await graphAll<MEvent>(ctx, id, `${GRAPH}${path}?${q}`, { Prefer: 'outlook.timezone="UTC"' })) {
        if (e.isCancelled) continue;
        const t = (x: { dateTime: string }) => (e.isAllDay ? x.dateTime.slice(0, 10) : wallClock(new Date(x.dateTime.replace(/(\.\d+)?$/, "Z")), tz(ctx)));
        out.push({ start: t(e.start), end: t(e.end), allDay: !!e.isAllDay, title: e.subject ?? "", calendar: c.name });
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  },
  async test(ctx) {
    const c = await graphAll<{ name: string }>(ctx, "microsoft-calendar", `${GRAPH}/me/calendars?$select=name`);
    return `${c.length} calendars: ${c.map((x) => x.name).join(", ")}`;
  },
};

async function todoList(ctx: ConnectorContext): Promise<{ id: string; displayName: string }> {
  const lists = await graphAll<{ id: string; displayName: string }>(ctx, "microsoft-todo", `${GRAPH}/me/todo/lists`);
  const name = String(ctx.settings.list || "Courses");
  const l = lists.find((x) => same(x.displayName, name));
  if (!l) throw new Error(`no To Do list named « ${name} » (lists: ${lists.map((x) => x.displayName).join(", ")})`);
  return l;
}

export const microsoftTodoConnector: ListSyncConnector & { test(ctx: ConnectorContext): Promise<string> } = {
  manifest: { id: "microsoft-todo", kind: "list-sync", name: "Microsoft To Do", oauth: "microsoft",
    description: "A Microsoft To Do list (also Outlook tasks; Alexa and Cortana can add to it).",
    settings: { ...msFields, list: { type: "string", title: "List name", default: "Courses", required: true } } },
  async pull(ctx) {
    const l = await todoList(ctx);
    const tasks = await graphAll<{ id: string; title: string; status: string }>(ctx, "microsoft-todo", `${GRAPH}/me/todo/lists/${l.id}/tasks?$top=100&$select=id,title,status`);
    return tasks.map((x): ListItem => ({ id: `${l.id}/${x.id}`, text: x.title, checked: x.status === "completed" }));
  },
  async setChecked(ctx, changes) {
    for (const c of changes) {
      const [list, task] = c.id.split("/");
      await apiCall(ctx, "microsoft", "microsoft-todo", `${GRAPH}/me/todo/lists/${list}/tasks/${task}`,
        { method: "PATCH", body: JSON.stringify({ status: c.checked ? "completed" : "notStarted" }) });
    }
  },
  async test(ctx) { const l = await todoList(ctx); return `« ${l.displayName} »: ${(await this.pull!(ctx)).length} tasks`; },
};

// ── Todoist (API v1, personal token) ──
const TD = "https://api.todoist.com/api/v1";
async function todoist<T>(ctx: ConnectorContext, path: string, init: RequestInit = {}): Promise<T> {
  const r = await ctx.fetch(`${TD}${path}`, { ...init, signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${ctx.settings.token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) } });
  if (!r.ok) throw new Error(`Todoist: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const text = await r.text();
  return (text ? JSON.parse(text) : null) as T;
}
async function todoistAll<T>(ctx: ConnectorContext, path: string): Promise<T[]> {
  const out: T[] = [];
  let cursor = "";
  do {
    const sep = path.includes("?") ? "&" : "?";
    const r = await todoist<{ results?: T[]; items?: T[]; next_cursor?: string | null }>(ctx, `${path}${cursor ? `${sep}cursor=${encodeURIComponent(cursor)}` : ""}`);
    out.push(...(r.results ?? r.items ?? []));
    cursor = r.next_cursor ?? "";
  } while (cursor);
  return out;
}
async function project(ctx: ConnectorContext) {
  const all = await todoistAll<{ id: string; name: string }>(ctx, "/projects");
  const name = String(ctx.settings.project || "Courses");
  const p = all.find((x) => same(x.name, name));
  if (!p) throw new Error(`no Todoist project named « ${name} » (projects: ${all.map((x) => x.name).join(", ")})`);
  return p;
}

export const todoistConnector: ListSyncConnector & { test(ctx: ConnectorContext): Promise<string> } = {
  manifest: { id: "todoist", kind: "list-sync", name: "Todoist", oauth: "todoist",
    description: "A Todoist project used as shopping list, shared in the family, synced both ways.",
    settings: { token: { type: "string", title: "API token", secret: true, required: true }, project: { type: "string", title: "Project", default: "Courses", required: true } } },
  async pull(ctx) {
    const p = await project(ctx);
    const open = await todoistAll<{ id: string; content: string }>(ctx, `/tasks?project_id=${p.id}`);
    // Done over there: Todoist hides completed tasks, read those of the last 2 weeks so they come back as « checked »
    let done: { id?: string; task_id?: string; content: string }[] = [];
    try {
      const q = new URLSearchParams({ project_id: p.id, since: new Date(Date.now() - 14 * 864e5).toISOString(), until: new Date().toISOString() });
      done = await todoistAll(ctx, `/tasks/completed/by_completion_date?${q}`);
    } catch (e) { ctx.log(`completed tasks unavailable: ${(e as Error).message}`); }
    return [...open.map((x) => ({ id: x.id, text: x.content, checked: false })),
      ...done.map((x) => ({ id: String(x.id ?? x.task_id), text: x.content, checked: true }))];
  },
  async setChecked(ctx, changes) {
    for (const c of changes) await todoist(ctx, `/tasks/${c.id}/${c.checked ? "close" : "reopen"}`, { method: "POST" });
  },
  async test(ctx) { const p = await project(ctx); return `« ${p.name} »: ${(await this.pull!(ctx)).filter((x) => !x.checked).length} open tasks`; },
};
