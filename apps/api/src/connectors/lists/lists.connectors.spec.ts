import { parseTodo, setTodoStatus } from "./lists.connectors";

const TODO = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VTODO", "UID:abc", "SUMMARY:Lait demi-\\, écrémé", "STATUS:NEEDS-ACTION", "END:VTODO", "END:VCALENDAR", ""].join("\r\n");

describe("CalDAV tasks", () => {
  it("reads a task", () => {
    expect(parseTodo(TODO, "https://dav/x.ics")).toEqual({ id: "https://dav/x.ics", text: "Lait demi-, écrémé", checked: false });
    expect(parseTodo(TODO.replace("NEEDS-ACTION", "CANCELLED"), "x")).toBeNull();
  });
  it("completes and reopens a task, keeping the rest", () => {
    const done = setTodoStatus(TODO, true, new Date("2026-11-04T10:00:00Z"));
    expect(done).toContain("STATUS:COMPLETED\r\n");
    expect(done).toContain("COMPLETED:20261104T100000Z");
    expect(done).toContain("UID:abc");
    expect(parseTodo(done, "x")?.checked).toBe(true);
    const open = setTodoStatus(done, false, new Date("2026-11-05T10:00:00Z"));
    expect(open).not.toContain("COMPLETED:");
    expect(parseTodo(open, "x")?.checked).toBe(false);
  });
});
