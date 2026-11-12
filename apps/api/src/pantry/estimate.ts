// Pantry estimate of one product family, from its purchases (date → quantity) and the « still have / bought » events:
// consumption rate = quantities bought before the last purchase / time between the first and the last purchase (last
// 6 months when they hold 3 purchases, else 18 months), corrected by the learned factor ; the last purchase covers
// quantity / rate days. Status: to buy (≤ 4 days), soon (≤ 14), ok, no longer bought (late by more than two cycles and
// 30 days), unknown (fewer than 3 purchases).
export type Status = "to_buy" | "soon" | "ok" | "stopped" | "unknown";
export interface Estimate { status: Status; last: string | null; next: string | null; cycleDays: number | null; purchases: number }

const DAY = 864e5;
const d = (s: string) => Date.parse(s + "T12:00:00Z");
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function estimate(purchases: Record<string, number>, events: string[], today: string, factor = 1, forcedDays: number | null = null): Estimate {
  const from = iso(d(today) - 548 * DAY);
  const all: Record<string, number> = {};
  for (const [day, q] of Object.entries(purchases)) if (day >= from && day <= today) all[day] = (all[day] ?? 0) + q;
  const sizes = Object.values(all).sort((a, b) => a - b), median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 1;
  for (const day of events) if (day >= from && day <= today) all[day] = (all[day] ?? 0) + median;   // a typical purchase that day
  let dates = Object.keys(all).sort();
  const res: Estimate = { status: "unknown", last: dates.at(-1) ?? null, next: null, cycleDays: null, purchases: dates.length };
  if (!dates.length) return res;
  const last = d(dates.at(-1)!);
  if (forcedDays) {
    res.cycleDays = forcedDays;
    res.next = iso(last + forcedDays * DAY);
  } else if (dates.length >= 3 && last - d(dates[0]) >= 14 * DAY) {
    const recent = dates.filter((x) => x >= iso(d(today) - 183 * DAY));
    if (recent.length >= 3 && last - d(recent[0]) >= 14 * DAY) dates = recent;
    const span = (last - d(dates[0])) / DAY;
    const rate = dates.slice(0, -1).reduce((s, x) => s + all[x], 0) / span * factor;   // quantity per day
    res.cycleDays = Math.round(span / (dates.length - 1) / factor);
    res.next = iso(last + Math.round(all[dates.at(-1)!] / rate) * DAY);
  }
  if (res.next) {
    const left = (d(res.next) - d(today)) / DAY;
    res.status = left <= 4 ? "to_buy" : left <= 14 ? "soon" : "ok";
    if (-left > Math.max(30, 2 * (res.cycleDays ?? 0))) res.status = "stopped";
  }
  return res;
}

/** Learning: a purchase well before the predicted date → consumed faster ; well after → slower ; « still have » while
 * « to buy » → slower. Factor kept between 0.4 and 2.5. */
export function learn(factor: number, change: "early" | "late" | "still_have"): number {
  const k = { early: 1.1, late: 0.92, still_have: 0.85 }[change];
  return Math.round(Math.min(2.5, Math.max(0.4, factor * k)) * 1000) / 1000;
}
