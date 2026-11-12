// Calendars (optional): ICS address, CalDAV (iCloud with an app-specific password, Nextcloud, Fastmail…), Home
// Assistant calendar entities. All return the events of a period in the household time zone.
import type { CalendarConnector, CalendarEvent, ConnectorContext } from "@pantarr/connector-sdk";
import { occurrences, parseIcs, wallClock } from "./ics";

const tz = (ctx: ConnectorContext) => String(ctx.settings.timezone || "Europe/Paris");

export const icsConnector: CalendarConnector = {
  manifest: { id: "ics", kind: "calendar", name: "ICS address (Google secret address, iCloud public calendar…)",
    settings: { url: { type: "url", title: "ICS URL (webcal:// accepted)", required: true }, name: { type: "string", title: "Name given to the planner", default: "Calendar" } } },
  async events(ctx, from, to) {
    const r = await ctx.fetch(String(ctx.settings.url).replace(/^webcal:/, "https:"), { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`ICS ${r.status}`);
    return occurrences(parseIcs(await r.text(), tz(ctx)), from, to, tz(ctx), String(ctx.settings.name || "Calendar"));
  },
  async test(ctx) { const e = await this.events(ctx, new Date().toISOString().slice(0, 10), new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)); return `${e.length} events in the next 7 days`; },
};

// ── CalDAV: principal → calendar home → calendars (filtered by name) → REPORT calendar-query on the period ──
export const xmlValues = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "g"))].map((m) => m[1]);
const href = (xml: string, tag: string) => xmlValues(xml, tag).flatMap((b) => xmlValues(b, "href"))[0];

export async function dav(ctx: ConnectorContext, url: string, method: string, depth: string, body: string) {
  const auth = Buffer.from(`${ctx.settings.username}:${ctx.settings.password}`).toString("base64");
  const r = await ctx.fetch(url, { method, signal: AbortSignal.timeout(30000), redirect: "follow",
    headers: { Authorization: `Basic ${auth}`, Depth: depth, "Content-Type": "application/xml; charset=utf-8" }, body });
  if (r.status >= 400) throw new Error(`CalDAV ${method} ${r.status}`);
  return { xml: await r.text(), url: r.url };
}

/** Collections of the account holding the given component (VEVENT: calendars, VTODO: task lists), filtered by name. */
export async function collections(ctx: ConnectorContext, component: "VEVENT" | "VTODO", names: string): Promise<{ url: string; name: string }[]> {
  const root = String(ctx.settings.url).replace(/\/$/, "") + "/";
  const p = await dav(ctx, root, "PROPFIND", "0", `<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`);
  const principal = new URL(href(p.xml, "current-user-principal") ?? "/", p.url).toString();
  const h = await dav(ctx, principal, "PROPFIND", "0", `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`);
  const home = new URL(href(h.xml, "calendar-home-set") ?? principal, h.url).toString();
  const l = await dav(ctx, home, "PROPFIND", "1", `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/></d:prop></d:propfind>`);
  const wanted = names.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  // A collection without a component set accepts every component (RFC 4791 § 5.2.3)
  const holds = (r: string) => { const set = xmlValues(r, "supported-calendar-component-set")[0]; return !set || set.includes(`"${component}"`); };
  return xmlValues(l.xml, "response").filter((r) => /calendar[\s/>]/.test(xmlValues(r, "resourcetype")[0] ?? "") && holds(r))
    .map((r) => ({ url: new URL(xmlValues(r, "href")[0], l.url).toString(), name: (xmlValues(r, "displayname")[0] ?? "").trim() }))
    .filter((c) => !wanted.length || wanted.includes(c.name.toLowerCase()));
}

export const caldavConnector: CalendarConnector = {
  manifest: { id: "caldav", kind: "calendar", name: "CalDAV (iCloud, Nextcloud, Fastmail…)", description: "iCloud: https://caldav.icloud.com with an app-specific password (appleid.apple.com).",
    settings: { url: { type: "url", title: "CalDAV URL", required: true, default: "https://caldav.icloud.com" }, username: { type: "string", title: "User name (Apple ID…)", required: true },
      password: { type: "string", title: "Password / app-specific password", secret: true, required: true }, calendars: { type: "string", title: "Calendars (comma separated, empty = all)" } } },
  async events(ctx, from, to) {
    const range = (d: string) => d.replace(/-/g, "") + "T000000Z";
    const out: CalendarEvent[] = [];
    for (const c of await collections(ctx, "VEVENT", String(ctx.settings.calendars ?? ""))) {
      const r = await dav(ctx, c.url, "REPORT", "1", `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop>`
        + `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${range(from)}" end="${range(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`);
      for (const data of xmlValues(r.xml, "calendar-data")) {
        const ics = data.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#13;/g, "");
        out.push(...occurrences(parseIcs(ics, tz(ctx)), from, to, tz(ctx), c.name));
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  },
  async test(ctx) { const c = await collections(ctx, "VEVENT", String(ctx.settings.calendars ?? "")); return `${c.length} calendars: ${c.map((x) => x.name).join(", ")}`; },
};

export const homeAssistantCalendarConnector: CalendarConnector = {
  manifest: { id: "home-assistant", kind: "calendar", name: "Home Assistant calendars",
    settings: { url: { type: "url", title: "Home Assistant URL", required: true }, token: { type: "string", title: "Long-lived access token", secret: true, required: true },
      calendars: { type: "string", title: "Calendar entities (comma separated)", required: true } } },
  async events(ctx, from, to) {
    const base = String(ctx.settings.url).replace(/\/$/, "");
    const out: CalendarEvent[] = [];
    for (const entity of String(ctx.settings.calendars).split(",").map((x) => x.trim()).filter(Boolean)) {
      const r = await ctx.fetch(`${base}/api/calendars/${entity}?start=${from}T00:00:00&end=${to}T00:00:00`, {
        headers: { Authorization: `Bearer ${ctx.settings.token}` }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`Home Assistant ${entity}: ${r.status}`);
      for (const e of await r.json() as { start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; summary?: string }[]) {
        const t = (x: { dateTime?: string; date?: string }) => x.date ?? wallClock(new Date(x.dateTime!), tz(ctx));
        out.push({ start: t(e.start), end: t(e.end), allDay: !!e.start.date, title: e.summary ?? "", calendar: entity.replace(/^calendar\./, "") });
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  },
  async test(ctx) { const e = await this.events(ctx, new Date().toISOString().slice(0, 10), new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)); return `${e.length} events in the next 7 days`; },
};
