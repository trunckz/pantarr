// Minimal iCalendar reader for presence: VEVENT start/end/title, all-day events, time zones, recurring events
// (RRULE DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY) and EXDATE. Times are given back as local
// wall-clock times of the household time zone ("YYYY-MM-DDTHH:MM"), which is what the meal planner reasons with.
import type { CalendarEvent } from "@pantarr/connector-sdk";

interface Raw { start: Date; end: Date; allDay: boolean; title: string; rrule?: Record<string, string>; exdates: number[] }
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Wall-clock time of a UTC instant in a time zone. */
export function wallClock(d: Date, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** UTC instant of a wall-clock time in a time zone (two-pass offset correction, exact outside DST gaps). */
function fromWall(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  const offset = (t: number) => { const w = wallClock(new Date(t), tz); return Date.UTC(+w.slice(0, 4), +w.slice(5, 7) - 1, +w.slice(8, 10), +w.slice(11, 13), +w.slice(14, 16)) - t; };
  const t1 = guess - offset(guess);
  return new Date(guess - offset(t1));
}

function parseDate(value: string, params: Record<string, string>, tz: string): { date: Date; allDay: boolean } {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) throw new Error(`bad date ${value}`);
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h || params.VALUE === "DATE") return { date: new Date(Date.UTC(+y, +mo - 1, +d)), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
  return { date: fromWall(+y, +mo - 1, +d, +h, +mi, +s, params.TZID || tz), allDay: false };
}

function unfold(text: string): string[] { return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/); }
const unescape = (v: string) => v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");

export function parseIcs(text: string, tz: string): Raw[] {
  const out: Raw[] = [];
  let cur: Partial<Raw> & { params?: Record<string, Record<string, string>>; values?: Record<string, string>; ex?: string[]; durMs?: number } | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { cur = { values: {}, params: {}, ex: [] }; continue; }
    if (line === "END:VEVENT" && cur) {
      const v = cur.values!, p = cur.params!;
      if (v.DTSTART && v.STATUS !== "CANCELLED") {
        const s = parseDate(v.DTSTART, p.DTSTART ?? {}, tz);
        const e = v.DTEND ? parseDate(v.DTEND, p.DTEND ?? {}, tz).date
          : new Date(s.date.getTime() + (cur.durMs ?? (s.allDay ? 864e5 : 0)));
        out.push({ start: s.date, end: e, allDay: s.allDay, title: unescape(v.SUMMARY ?? ""),
          rrule: v.RRULE ? Object.fromEntries(v.RRULE.split(";").map((x) => x.split("=") as [string, string])) : undefined,
          exdates: (cur.ex ?? []).flatMap((x) => x.split(",")).map((x) => parseDate(x, p.EXDATE ?? {}, tz).date.getTime()) });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
    if (!m) continue;
    const [, name, rawParams, value] = m;
    const params = Object.fromEntries(rawParams.split(";").filter(Boolean).map((x) => x.split("=") as [string, string]));
    if (name === "EXDATE") { cur.ex!.push(value); cur.params!.EXDATE = params; continue; }
    if (name === "DURATION") {
      const d = value.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
      if (d) cur.durMs = ((+(d[1] ?? 0) * 7 + +(d[2] ?? 0)) * 24 * 60 + +(d[3] ?? 0) * 60 + +(d[4] ?? 0)) * 60e3;
    }
    cur.values![name] = value; cur.params![name] = params;
  }
  return out;
}

/** Occurrences of the events overlapping [from, to) (dates, household time zone). */
export function occurrences(events: Raw[], from: string, to: string, tz: string, calendar: string): CalendarEvent[] {
  const lo = fromWall(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10), 0, 0, 0, tz).getTime();
  const hi = fromWall(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10), 0, 0, 0, tz).getTime();
  const res: CalendarEvent[] = [];
  const push = (start: number, len: number, e: Raw) => {
    if (start < hi && start + Math.max(len, 1) > lo && !e.exdates.includes(start)) {
      const fmt = (t: number) => e.allDay ? new Date(t).toISOString().slice(0, 10) : wallClock(new Date(t), tz);
      res.push({ start: fmt(start), end: fmt(start + len), allDay: e.allDay, title: e.title, calendar });
    }
  };
  for (const e of events) {
    const len = e.end.getTime() - e.start.getTime();
    if (!e.rrule) { push(e.start.getTime(), len, e); continue; }
    const r = e.rrule, interval = +(r.INTERVAL ?? 1), until = r.UNTIL ? parseDate(r.UNTIL, {}, tz).date.getTime() : Infinity;
    let count = r.COUNT ? +r.COUNT : Infinity;
    const byDay = r.BYDAY?.split(",").map((d) => DAYS.indexOf(d.slice(-2))).filter((d) => d >= 0);
    for (let i = 0; i < 2000 && count > 0; i++) {
      // Candidate occurrences of period i (wall-clock arithmetic in the event's own instant)
      const base = new Date(e.start.getTime());
      const cands: Date[] = [];
      if (r.FREQ === "DAILY") { base.setUTCDate(base.getUTCDate() + i * interval); cands.push(base); }
      else if (r.FREQ === "WEEKLY") {
        const weekStart = new Date(e.start.getTime()); weekStart.setUTCDate(weekStart.getUTCDate() + i * 7 * interval);
        for (const d of byDay?.length ? byDay : [e.start.getUTCDay()]) {
          const c = new Date(weekStart.getTime()); c.setUTCDate(c.getUTCDate() + ((d - weekStart.getUTCDay() + 7) % 7)); cands.push(c);
        }
        cands.sort((a, b) => a.getTime() - b.getTime());
      } else if (r.FREQ === "MONTHLY") { base.setUTCMonth(base.getUTCMonth() + i * interval); cands.push(base); }
      else if (r.FREQ === "YEARLY") { base.setUTCFullYear(base.getUTCFullYear() + i * interval); cands.push(base); }
      else break;
      let stop = false;
      for (const c of cands) {
        const t = c.getTime();
        if (t < e.start.getTime()) continue;
        if (t > until || count <= 0 || t >= hi) { stop = true; break; }
        count--;
        push(t, len, e);
      }
      if (stop) break;
    }
  }
  return res.sort((a, b) => a.start.localeCompare(b.start));
}
