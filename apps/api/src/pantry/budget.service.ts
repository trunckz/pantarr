// Budget of a household: what it spends (its purchases of the last weeks), what the shopping list will cost, and the
// weekly budget it set (given to the planner, who then favours cheaper dishes when the spending goes over).
import { Injectable } from "@nestjs/common";
import { settingsOf } from "../households/households.defaults";
import { PrismaService } from "../prisma/prisma.service";
import { estimateList, priceIndex, round, type ListEstimate } from "./prices";

export interface Spending { last7: number; last28: number; weeklyAverage: number; receipts: number; since: string | null }

@Injectable()
export class BudgetService {
  constructor(private prisma: PrismaService) {}

  /** Prices of the last 6 months. */
  private async index(householdId: string) {
    const since = new Date(Date.now() - 183 * 864e5);
    const rows = await this.prisma.purchase.findMany({ where: { product: { householdId }, date: { gte: since }, unitPrice: { not: null } },
      select: { unitPrice: true, product: { select: { label: true } } } });
    return priceIndex(rows.map((r) => ({ label: r.product.label, unitPrice: r.unitPrice })));
  }

  /** Spending of the last 7 and 28 days, from the purchases (receipts, invoices, orders). */
  async spending(householdId: string): Promise<Spending> {
    const day = 864e5, now = Date.now();
    const rows = await this.prisma.purchase.findMany({ where: { product: { householdId }, date: { gte: new Date(now - 28 * day) }, unitPrice: { not: null } },
      select: { date: true, quantity: true, unitPrice: true, externalId: true } });
    const sum = (from: number) => round(rows.filter((r) => r.date.getTime() >= from).reduce((n, r) => n + (r.unitPrice ?? 0) * (r.quantity || 1), 0));
    const first = await this.prisma.purchase.findFirst({ where: { product: { householdId } }, orderBy: { date: "asc" }, select: { date: true } });
    // a household that started less than 4 weeks ago: the average over the weeks it has
    const weeks = first ? Math.min(4, Math.max(1, (now - first.date.getTime()) / (7 * day))) : 4;
    const last28 = sum(now - 28 * day);
    return { last7: sum(now - 7 * day), last28, weeklyAverage: round(last28 / weeks), receipts: new Set(rows.map((r) => r.externalId ?? "")).size,
      since: first ? first.date.toISOString().slice(0, 10) : null };
  }

  /** What the given articles will cost, from the prices the household paid. */
  async estimate(householdId: string, articles: string[]): Promise<ListEstimate> {
    const prefs = await this.prisma.productPreference.findMany({ where: { householdId }, select: { article: true, product: true } });
    return estimateList(articles, await this.index(householdId), prefs);
  }

  async budget(householdId: string) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    return { weeklyBudget: settingsOf(h).weeklyBudget ?? null, spending: await this.spending(householdId) };
  }

  /** Line given to the planner (only when a budget is set). */
  async rule(householdId: string, fr: boolean): Promise<string> {
    const { weeklyBudget, spending } = await this.budget(householdId);
    if (!weeklyBudget) return "";
    const over = spending.receipts > 0 && spending.weeklyAverage > weeklyBudget;
    const spent = spending.receipts > 0 ? (fr ? ` (dépense moyenne de ces dernières semaines : ${spending.weeklyAverage} €)` : ` (average spending of the last weeks: ${spending.weeklyAverage})`) : "";
    return fr
      ? `\n\nBudget courses du foyer : environ ${weeklyBudget} € par semaine${spent}. ${over ? "La dépense dépasse le budget : privilégie nettement les plats économiques" : "Reste dans ce budget : préfère les plats économiques quand ils conviennent"} (légumineuses, œufs, légumes de saison, plats mijotés qui font des restes, moins de viande rouge et de produits transformés), sans sacrifier l'équilibre.`
      : `\n\nGrocery budget of the household: about ${weeklyBudget} per week${spent}. ${over ? "Spending is over the budget: clearly favour cheap dishes" : "Stay within it: prefer cheap dishes when they fit"} (pulses, eggs, seasonal vegetables, stews that make leftovers, less red meat and processed food), without giving up balance.`;
  }
}
