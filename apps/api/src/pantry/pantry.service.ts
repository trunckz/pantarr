// Pantry: product families (seeded per language), their estimate from the purchases and the events, learning, and the
// link with the shopping list (« add », « still have », item checked = bought). Also the products bought most, for the
// planner (fresh food) and the cart (phase 5).
import { Injectable, Logger } from "@nestjs/common";
import type { InventoryConnector, StockLevel } from "@pantarr/connector-sdk";
import type { PantryFamily } from "@prisma/client";
import { ConnectorsService, IMPLEMENTED } from "../connectors/connectors.service";
import { settingsOf } from "../households/households.defaults";
import { key } from "../common/text";
import { PrismaService } from "../prisma/prisma.service";
import { ShoppingService } from "../shopping/shopping.service";
import { estimate, learn } from "./estimate";
import { FAMILY_SEEDS, FRESH_WORDS } from "./seeds";

const text = (s: string) => ` ${key(s)} `;
export function inFamily(label: string, f: Pick<PantryFamily, "keywords" | "excludes">): boolean {
  const t = text(label);
  const has = (w: string) => t.includes(w.startsWith(" ") ? ` ${key(w)} ` : ` ${key(w)}`);
  return f.keywords.some(has) && !f.excludes.some(has);
}

@Injectable()
export class PantryService {
  private log = new Logger("pantry");
  constructor(private prisma: PrismaService, private shopping: ShoppingService, private connectors: ConnectorsService) {}

  /** Stock of the enabled inventory connectors (Grocy…), null without one ; an unreachable one is left out. */
  async inventory(householdId: string): Promise<StockLevel[] | null> {
    const enabled = await this.prisma.connectorInstance.findMany({ where: { householdId, kind: "inventory", enabled: true } });
    if (!enabled.length) return null;
    const out: StockLevel[] = [];
    for (const i of enabled) {
      const c = (IMPLEMENTED as unknown as Record<string, InventoryConnector>)[i.moduleId];
      if (!c) continue;
      try { out.push(...await c.stock((await this.connectors.context(householdId, i.moduleId))!)); }
      catch (e) { this.log.warn(`${i.moduleId}: ${(e as Error).message}`); }
    }
    return out;
  }

  async families(householdId: string) {
    let list = await this.prisma.pantryFamily.findMany({ where: { householdId }, orderBy: [{ position: "asc" }, { name: "asc" }] });
    if (!list.length) {
      const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
      await this.prisma.pantryFamily.createMany({ data: (FAMILY_SEEDS[h.locale] ?? FAMILY_SEEDS.en).map((f, position) => ({
        householdId, position, category: f.category, name: f.name, aisle: f.aisle, keywords: f.keywords, excludes: f.excludes ?? [] })) });
      list = await this.prisma.pantryFamily.findMany({ where: { householdId }, orderBy: [{ position: "asc" }, { name: "asc" }] });
    }
    return list;
  }

  /** Every family with its estimate ; learning from the purchases that arrived since the last estimate. */
  async overview(householdId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - 548 * 864e5);
    const families = await this.families(householdId);
    const products = await this.prisma.product.findMany({ where: { householdId }, include: { purchases: { where: { date: { gte: since } } } } });
    const events = await this.prisma.pantryEvent.findMany({ where: { family: { householdId }, at: { gte: since } } });
    const inventory = await this.inventory(householdId);
    const out = [];
    for (const f of families) {
      const mine = products.filter((p) => inFamily(p.label, f) && p.purchases.length);
      const byDay: Record<string, number> = {};
      for (const p of mine) for (const x of p.purchases) { const d = x.date.toISOString().slice(0, 10); byDay[d] = (byDay[d] ?? 0) + x.quantity; }
      const ev = events.filter((e) => e.familyId === f.id).map((e) => e.at.toISOString().slice(0, 10));
      let factor = f.factor;
      const lastNow = [...Object.keys(byDay), ...ev].sort().at(-1) ?? null;
      // Learning: a new purchase compared with the date that was predicted
      if (lastNow && f.lastSeen && f.predicted && lastNow > f.lastSeen.toISOString().slice(0, 10)) {
        const gap = (Date.parse(lastNow) - f.predicted.getTime()) / 864e5;
        if (gap <= -5) factor = learn(factor, "early"); else if (gap >= 10) factor = learn(factor, "late");
      }
      const e = estimate(byDay, ev, today, factor, f.forcedDays);
      if (factor !== f.factor || e.last !== f.lastSeen?.toISOString().slice(0, 10) || e.next !== f.predicted?.toISOString().slice(0, 10)) {
        await this.prisma.pantryFamily.update({ where: { id: f.id }, data: { factor, lastSeen: e.last ? new Date(e.last) : null, predicted: e.next ? new Date(e.next) : null } });
      }
      // Inventory (Grocy): what is really there wins over the estimate
      const held = inventory?.filter((x) => inFamily(x.product, f)) ?? [];
      const stock = held.length ? held.reduce((n, x) => n + x.quantity, 0) : null;
      const status = stock === null ? e.status : stock <= held.reduce((n, x) => n + (x.minimum ?? 0), 0) ? "to_buy" : "ok";
      out.push({ id: f.id, category: f.category, name: f.name, aisle: f.aisle, keywords: f.keywords, excludes: f.excludes, forcedDays: f.forcedDays,
        factor, ...e, status, stock, product: this.suggested(mine) });
    }
    return out;
  }

  /** Product proposed for a family: the last one bought, a product of the online store (full name) of the 4 months
   * before the last purchase first. */
  private suggested(products: { label: string; channel: string; purchases: { date: Date; quantity: number }[] }[]) {
    if (!products.length) return null;
    const last = (p: (typeof products)[0]) => Math.max(...p.purchases.map((x) => x.date.getTime()));
    const newest = Math.max(...products.map(last));
    const online = products.filter((p) => p.channel === "online" && last(p) >= newest - 120 * 864e5);
    const pool = online.length ? online : products;
    return pool.sort((a, b) => last(b) - last(a))[0].label;
  }

  async stillHave(householdId: string, familyId: string) {
    const f = await this.prisma.pantryFamily.findFirstOrThrow({ where: { id: familyId, householdId } });
    const est = (await this.overview(householdId)).find((x) => x.id === familyId);
    if (est?.status === "to_buy") await this.prisma.pantryFamily.update({ where: { id: f.id }, data: { factor: learn(f.factor, "still_have") } });
    await this.prisma.pantryEvent.create({ data: { familyId, kind: "still-have" } });
    return { ok: true };
  }

  async addToList(householdId: string, familyId: string) {
    const f = await this.prisma.pantryFamily.findFirstOrThrow({ where: { id: familyId, householdId } });
    const product = (await this.overview(householdId)).find((x) => x.id === familyId)?.product ?? undefined;
    return this.shopping.add(householdId, f.name, f.aisle, undefined, { pantarr_origin: "pantry", pantarr_family: f.id, ...(product ? { pantarr_product: product.slice(0, 200) } : {}) });
  }

  /** An item checked in the list: bought for its family (item from the pantry, or name of a family). */
  async bought(householdId: string, item: { note: string; extras?: Record<string, string> }) {
    const families = await this.prisma.pantryFamily.findMany({ where: { householdId } });
    const f = families.find((x) => x.id === item.extras?.pantarr_family) ?? families.find((x) => key(x.name) === key(item.note) || inFamily(item.note, x));
    if (f) await this.prisma.pantryEvent.create({ data: { familyId: f.id, kind: "bought" } });
  }

  /** Fresh products bought most this year (planner): distinct purchase days, aisles of fresh food. */
  async freshProducts(householdId: string, locale: string, limit = 30): Promise<string[]> {
    const words = FRESH_WORDS[locale] ?? FRESH_WORDS.en;
    const since = new Date(Date.now() - 365 * 864e5);
    const products = await this.prisma.product.findMany({ where: { householdId }, include: { purchases: { where: { date: { gte: since } }, select: { date: true } } } });
    return products.map((p) => ({ p, n: new Set(p.purchases.map((x) => x.date.toISOString().slice(0, 10))).size }))
      .filter(({ p, n }) => n > 0 && words.words.some((w) => text(p.label).includes(` ${key(w)}`)) && !words.not.some((w) => text(p.label).includes(` ${key(w)}`)))
      .sort((a, b) => b.n - a.n).slice(0, limit).map(({ p, n }) => `${p.label} (${n}×)`);
  }

  async updateFamily(householdId: string, id: string, b: Partial<Pick<PantryFamily, "name" | "category" | "aisle" | "keywords" | "excludes" | "forcedDays">>) {
    await this.prisma.pantryFamily.findFirstOrThrow({ where: { id, householdId } });
    return this.prisma.pantryFamily.update({ where: { id }, data: b });
  }

  async createFamily(householdId: string, b: { name: string; category: string; aisle: string; keywords: string[]; excludes?: string[] }) {
    return this.prisma.pantryFamily.create({ data: { householdId, ...b, excludes: b.excludes ?? [], position: 999 } });
  }

  async deleteFamily(householdId: string, id: string) {
    await this.prisma.pantryFamily.deleteMany({ where: { id, householdId } });
    return { ok: true };
  }

  /** Products bought for an article (cart, phase 5): most recent first, then most often. */
  async productsFor(householdId: string, query: string) {
    const words = key(query).split(" ").filter((w) => w.length > 2);
    const products = await this.prisma.product.findMany({ where: { householdId }, include: { purchases: { select: { date: true } } } });
    return products.filter((p) => words.every((w) => text(p.label).includes(` ${w}`)))
      .map((p) => ({ label: p.label, brand: p.brand, channel: p.channel, times: p.purchases.length, last: p.purchases.map((x) => x.date.toISOString().slice(0, 10)).sort().at(-1) }))
      .sort((a, b) => (b.last ?? "").localeCompare(a.last ?? "") || b.times - a.times).slice(0, 10);
  }
}
