// Budget of the household: weekly budget set, recent spending (receipts), estimated cost of the shopping list.
import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthUser, CurrentUser } from "../auth/decorators";
import { householdAccess } from "../common/access";
import { PrismaService } from "../prisma/prisma.service";
import { ShoppingService } from "../shopping/shopping.service";
import { BudgetService } from "./budget.service";

@ApiTags("pantry")
@Controller("households/:id/budget")
export class BudgetController {
  constructor(private prisma: PrismaService, private budget: BudgetService, private shopping: ShoppingService) {}

  /** Budget set, spending of the last 7 and 28 days, and what the articles still to buy should cost (per list). */
  @Get()
  async get(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    await householdAccess(this.prisma, me, id);
    const b = await this.budget.budget(id);
    const items = await this.shopping.list(id).then((l) => l.items.filter((x) => !x.checked)).catch(() => []);
    const est = await this.budget.estimate(id, items.map((x) => String(x.text ?? "")));
    const byArea = (area: string) => {
      const keep = items.map((x, i) => (x.area === area ? i : -1)).filter((i) => i >= 0);
      const lines = keep.map((i) => est.lines[i]);
      return { known: Math.round(lines.reduce((n, l) => n + (l.price ?? 0), 0) * 100) / 100, items: lines.length, priced: lines.filter((l) => l.price !== null).length };
    };
    return { ...b, list: { known: est.known, total: est.total, items: est.items, priced: est.priced, online: byArea("online"), inStore: byArea("in-store"),
      lines: items.map((x, i) => ({ id: x.id, price: est.lines[i].price })) } };
  }
}
