import { occurrences, parseIcs } from "./ics";

const ics = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
const TZ = "Europe/Paris";

describe("iCalendar reader", () => {
  it("reads a timed event in its time zone and gives the household wall-clock time", () => {
    const e = parseIcs(ics("BEGIN:VEVENT\r\nDTSTART;TZID=Europe/Paris:20261110T190000\r\nDTEND;TZID=Europe/Paris:20261110T230000\r\nSUMMARY:Restaurant\\, anniversaire\r\nEND:VEVENT"), TZ);
    expect(occurrences(e, "2026-11-09", "2026-11-16", TZ, "Famille")).toEqual([
      { start: "2026-11-10T19:00", end: "2026-11-10T23:00", allDay: false, title: "Restaurant, anniversaire", calendar: "Famille" }]);
  });

  it("converts UTC times and unfolds long lines", () => {
    const e = parseIcs(ics("BEGIN:VEVENT\r\nDTSTART:20261110T110000Z\r\nDTEND:20261110T120000Z\r\nSUMMARY:Déjeuner \r\n chez mamie\r\nEND:VEVENT"), TZ);
    expect(occurrences(e, "2026-11-10", "2026-11-11", TZ, "x")[0]).toMatchObject({ start: "2026-11-10T12:00", title: "Déjeuner chez mamie" });
  });

  it("keeps all-day events as dates", () => {
    const e = parseIcs(ics("BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261111\r\nDTEND;VALUE=DATE:20261112\r\nSUMMARY:Férié\r\nEND:VEVENT"), TZ);
    expect(occurrences(e, "2026-11-09", "2026-11-16", TZ, "x")[0]).toMatchObject({ start: "2026-11-11", end: "2026-11-12", allDay: true });
  });

  it("expands weekly recurring events with BYDAY, COUNT and EXDATE", () => {
    const e = parseIcs(ics("BEGIN:VEVENT\r\nDTSTART;TZID=Europe/Paris:20261102T120000\r\nDTEND;TZID=Europe/Paris:20261102T133000\r\n"
      + "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6\r\nEXDATE;TZID=Europe/Paris:20261111T120000\r\nSUMMARY:Nounou\r\nEND:VEVENT"), TZ);
    expect(occurrences(e, "2026-11-01", "2026-12-01", TZ, "x").map((o) => o.start)).toEqual(
      ["2026-11-02T12:00", "2026-11-04T12:00", "2026-11-09T12:00", "2026-11-16T12:00", "2026-11-18T12:00"]);
  });

  it("stops recurring events at UNTIL and skips cancelled ones", () => {
    const e = parseIcs(ics("BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261101\r\nRRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261107\r\nSUMMARY:Garde\r\nEND:VEVENT\r\n"
      + "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261103\r\nSTATUS:CANCELLED\r\nSUMMARY:Annulé\r\nEND:VEVENT"), TZ);
    expect(occurrences(e, "2026-11-01", "2026-11-30", TZ, "x").map((o) => o.start)).toEqual(["2026-11-01", "2026-11-03", "2026-11-05", "2026-11-07"]);
  });
});
