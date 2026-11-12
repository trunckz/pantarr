import { estimate, learn } from "./estimate";

const every = (start: string, days: number, n: number, q = 1) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [new Date(Date.parse(start) + i * days * 864e5).toISOString().slice(0, 10), q]));

describe("pantry estimate", () => {
  it("predicts the next purchase from the rhythm", () => {
    const e = estimate(every("2026-08-01", 11, 9), [], "2026-11-02");   // every 11 days, last on 2026-10-28
    expect(e).toMatchObject({ last: "2026-10-28", next: "2026-11-08", cycleDays: 11, status: "soon", purchases: 9 });
  });
  it("says to buy when the end is near", () => {
    expect(estimate(every("2026-08-01", 11, 9), [], "2026-11-07").status).toBe("to_buy");
  });
  it("needs three purchases", () => {
    expect(estimate(every("2026-10-01", 10, 2), [], "2026-11-04")).toMatchObject({ status: "unknown", purchases: 2 });
  });
  it("uses a forced cycle when one is set", () => {
    expect(estimate({ "2026-10-20": 1 }, [], "2026-11-04", 1, 45)).toMatchObject({ next: "2026-12-04", status: "ok" });
  });
  it("marks a family no longer bought", () => {
    expect(estimate(every("2025-12-01", 16, 8), [], "2026-11-04").status).toBe("stopped");
  });
  it("counts « still have » as a typical purchase, and the factor slows the rhythm", () => {
    const base = estimate(every("2026-08-01", 11, 9), ["2026-11-04"], "2026-11-04");
    expect(base.last).toBe("2026-11-04");
    expect(estimate(every("2026-08-01", 11, 9), [], "2026-11-04", 0.5).cycleDays).toBe(22);
  });
  it("learns within bounds", () => {
    expect(learn(1, "still_have")).toBe(0.85);
    expect(learn(2.4, "early")).toBe(2.5);
    expect(learn(0.42, "late")).toBe(0.4);
  });
});
