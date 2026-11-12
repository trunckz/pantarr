// Shared lists (optional): Home Assistant to-do entities (local list, Bring!, OurGroceries…), CalDAV tasks
// (Nextcloud Tasks, Apple Reminders through iCloud is NOT possible: Reminders left CalDAV), Google Keep through the
// small « pantarr-keep » companion (gkeepapi, Python), Apple Shortcuts / Siri (inbound only: the shortcut calls
// POST /api/v1/bridge/list/add with a « bridge » key). The sync itself is in list-sync/.
import type { ConnectorContext, ListItem, ListSyncConnector } from "@pantarr/connector-sdk";
import { collections, dav, xmlValues } from "../calendar/calendar.connectors";

// ── Home Assistant to-do ──
async function ha<T>(ctx: ConnectorContext, service: string, body: Record<string, unknown>, response = false): Promise<T> {
  const base = String(ctx.settings.url).replace(/\/$/, "");
  const r = await ctx.fetch(`${base}/api/services/todo/${service}${response ? "?return_response" : ""}`, { method: "POST", signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${ctx.settings.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Home Assistant ${service}: ${r.status}`);
  return r.json() as Promise<T>;
}

export const homeAssistantTodoConnector: ListSyncConnector & { test(ctx: ConnectorContext): Promise<string> } = {
  manifest: { id: "home-assistant-todo", kind: "list-sync", name: "Home Assistant to-do list",
    description: "Any to-do entity of Home Assistant (local shopping list, Bring!, OurGroceries…); Assist voice commands add to it.",
    settings: { url: { type: "url", title: "Home Assistant URL", required: true }, token: { type: "string", title: "Long-lived access token", secret: true, required: true },
      entity: { type: "string", title: "To-do entity", default: "todo.shopping_list", required: true } } },
  async pull(ctx) {
    const entity = String(ctx.settings.entity || "todo.shopping_list");
    const r = await ha<{ service_response?: Record<string, { items?: { uid: string; summary: string; status: string }[] }> }>(ctx, "get_items", { entity_id: entity }, true);
    return (r.service_response?.[entity]?.items ?? []).map((x) => ({ id: x.uid, text: x.summary, checked: x.status === "completed" }));
  },
  async setChecked(ctx, changes) {
    for (const c of changes) await ha(ctx, "update_item", { entity_id: String(ctx.settings.entity || "todo.shopping_list"), item: c.id, status: c.checked ? "completed" : "needs_action" });
  },
  async test(ctx) { return `${(await this.pull!(ctx)).length} items`; },
};

// ── CalDAV tasks (VTODO) ──
const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#13;/g, "");
const unfold = (ics: string) => ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
const prop = (block: string, name: string) => block.match(new RegExp(`^${name}(?:;[^:\\n]*)?:(.*)$`, "m"))?.[1]?.trim();
const icsText = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");

/** VTODO of a task file → item (id = address of the file). */
export function parseTodo(ics: string, id: string): ListItem | null {
  const block = unfold(ics).match(/BEGIN:VTODO\n([\s\S]*?)END:VTODO/)?.[1];
  if (!block) return null;
  const status = prop(block, "STATUS")?.toUpperCase();
  if (status === "CANCELLED") return null;
  return { id, text: icsText(prop(block, "SUMMARY") ?? ""), checked: status === "COMPLETED" || !!prop(block, "COMPLETED") };
}

/** The same task file, completed or not (STATUS, COMPLETED, PERCENT-COMPLETE; the rest untouched). */
export function setTodoStatus(ics: string, checked: boolean, now: Date): string {
  const eol = ics.includes("\r\n") ? "\r\n" : "\n";
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return unfold(ics).replace(/BEGIN:VTODO\n([\s\S]*?)END:VTODO/, (_, block: string) => {
    const kept = block.split("\n").filter((l) => l && !/^(STATUS|COMPLETED|PERCENT-COMPLETE|LAST-MODIFIED)[;:]/.test(l));
    kept.push(`STATUS:${checked ? "COMPLETED" : "NEEDS-ACTION"}`, `LAST-MODIFIED:${stamp}`, ...(checked ? [`COMPLETED:${stamp}`, "PERCENT-COMPLETE:100"] : []));
    return `BEGIN:VTODO\n${kept.join("\n")}\nEND:VTODO`;
  }).split("\n").join(eol);
}

export const caldavTasksConnector: ListSyncConnector & { test(ctx: ConnectorContext): Promise<string> } = {
  manifest: { id: "caldav-tasks", kind: "list-sync", name: "CalDAV tasks (Nextcloud Tasks, Thunderbird, Fastmail…)",
    settings: { url: { type: "url", title: "CalDAV URL", required: true }, username: { type: "string", title: "User name", required: true },
      password: { type: "string", title: "Password / app password", secret: true, required: true }, list: { type: "string", title: "Task list", default: "Shopping", required: true } } },
  async pull(ctx) {
    const out: ListItem[] = [];
    for (const c of await collections(ctx, "VTODO", String(ctx.settings.list ?? ""))) {
      const r = await dav(ctx, c.url, "REPORT", "1", `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>`
        + `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"/></c:comp-filter></c:filter></c:calendar-query>`);
      for (const resp of xmlValues(r.xml, "response")) {
        const href = xmlValues(resp, "href")[0], data = xmlValues(resp, "calendar-data")[0];
        const t = href && data ? parseTodo(unescape(data), new URL(href, r.url).toString()) : null;
        if (t) out.push(t);
      }
    }
    return out;
  },
  async setChecked(ctx, changes) {
    const auth = `Basic ${Buffer.from(`${ctx.settings.username}:${ctx.settings.password}`).toString("base64")}`;
    for (const c of changes) {
      const g = await ctx.fetch(c.id, { headers: { Authorization: auth }, signal: AbortSignal.timeout(30000) });
      if (!g.ok) throw new Error(`CalDAV GET ${g.status}`);
      const etag = g.headers.get("etag");
      const p = await ctx.fetch(c.id, { method: "PUT", signal: AbortSignal.timeout(30000), body: setTodoStatus(await g.text(), c.checked, new Date()),
        headers: { Authorization: auth, "Content-Type": "text/calendar; charset=utf-8", ...(etag ? { "If-Match": etag } : {}) } });
      if (!p.ok) throw new Error(`CalDAV PUT ${p.status}`);
    }
  },
  async test(ctx) { const l = await collections(ctx, "VTODO", String(ctx.settings.list ?? "")); return `${l.length} task lists: ${l.map((x) => x.name).join(", ")}`; },
};

// ── Google Keep, through the pantarr-keep companion (no public API: gkeepapi with a master token) ──
async function keep<T>(ctx: ConnectorContext, path: string, extra: Record<string, unknown> = {}): Promise<T> {
  const base = String(ctx.settings.companion || "http://pantarr-keep:8080").replace(/\/$/, "");
  const r = await ctx.fetch(`${base}${path}`, { method: "POST", signal: AbortSignal.timeout(90000), headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ctx.settings.email, token: ctx.settings.masterToken, list: ctx.settings.list || "Shopping", ...extra }) });
  if (!r.ok) throw new Error(`Google Keep: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

export const googleKeepConnector: ListSyncConnector & { test(ctx: ConnectorContext): Promise<string> } = {
  manifest: { id: "google-keep", kind: "list-sync", name: "Google Keep",
    description: "Needs the pantarr-keep companion container (docker compose --profile keep). Google Assistant / Gemini voice notes land in Keep.",
    settings: { email: { type: "string", title: "Google account", required: true }, masterToken: { type: "string", title: "Master token (gpsoauth)", secret: true, required: true },
      list: { type: "string", title: "List name", default: "Shopping", required: true },
      companion: { type: "url", title: "Companion address", default: "http://pantarr-keep:8080" } } },
  async pull(ctx) { return (await keep<{ items: ListItem[] }>(ctx, "/pull")).items; },
  async setChecked(ctx, changes) { if (changes.length) await keep(ctx, "/check", { changes }); },
  async test(ctx) { return `${(await this.pull!(ctx)).length} items`; },
};

// ── Apple Shortcuts / Siri: inbound only ──
export const appleShortcutsConnector: ListSyncConnector & { test(ctx: ConnectorContext): Promise<string> } = {
  manifest: { id: "apple-shortcuts", kind: "list-sync", name: "Apple Shortcuts / Siri",
    description: "Apple Reminders has no open API: a Shortcut (« Add to the shopping list ») sends what you dictate to Pantarr. My account → Voice assistants gives the address and a key.",
    settings: {} },
  async test() { return "POST /api/v1/bridge/list/add with a « bridge » key (My account → Voice assistants)"; },
};
