import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { noteAdminAccess } from "../common/access";
import { ApiTags } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";
import { AuthUser, CurrentUser } from "../auth/decorators";
import { AppError } from "../i18n/i18n";
import { JobsService } from "../jobs/jobs.service";
import { PrismaService } from "../prisma/prisma.service";
import { settingsOf } from "../households/households.defaults";
import { ShoppingService } from "../shopping/shopping.service";
import { PlanningService } from "./planning.service";
import { DEFAULT_TEMPLATES, PLACEHOLDERS } from "./templates";

class PeriodDto { @IsISO8601() start: string; @Type(() => Number) @IsInt() @Min(1) @Max(21) days: number }
class ProposeDto extends PeriodDto { /** wishes for this period only (guests, an absence, a craving…) */ @IsOptional() @IsString() @MaxLength(2000) notes?: string }
class ChangeDto {
  @IsISO8601() start: string; @IsInt() @Min(0) index: number; @IsOptional() @IsString() wish?: string;
  /** other meals replaced with it (linked by leftovers) */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsInt({ each: true }) @Min(0, { each: true }) also?: number[];
}
class StartDto { @IsISO8601() start: string }

@ApiTags("planning")
@Controller("households/:id/planning")
export class PlanningController {
  constructor(private planning: PlanningService, private jobs: JobsService, private prisma: PrismaService, private shopping: ShoppingService) {}

  private async access(me: AuthUser, id: string) {
    if (me.role === "ADMIN") return noteAdminAccess(this.prisma, me, id, "meal planning");
    if (!(await this.prisma.membership.findUnique({ where: { userId_householdId: { userId: me.id, householdId: id } } }))) throw new AppError(403, "auth.forbidden");
  }

  /** Draft and Mealie meal plan of a period, running job, LLM usage of the month. */
  @Get()
  async period(@CurrentUser() me: AuthUser, @Param("id") id: string, @Query() q: PeriodDto) {
    await this.access(me, id);
    return this.planning.period(id, q.start.slice(0, 10), q.days);
  }

  @Post("propose")
  async propose(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: ProposeDto) {
    await this.access(me, id);
    return this.planning.propose(id, b.start.slice(0, 10), b.days, (b.notes ?? "").trim());
  }

  @Post("change")
  async change(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: ChangeDto) {
    await this.access(me, id);
    return this.planning.change(id, b.start.slice(0, 10), b.index, b.wish ?? "", b.also ?? []);
  }

  /** Into the Mealie meal plan ; with « autoShopping » (default), the shopping list is prepared too (background job). */
  @Post("validate")
  async validate(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: StartDto) {
    await this.access(me, id);
    const r = await this.planning.validate(id, b.start.slice(0, 10));
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id } });
    return settingsOf(h).autoShopping ? { ...r, shoppingJob: (await this.shopping.fromMeals(id, b.start.slice(0, 10))).id } : r;
  }

  @Get("jobs/:job")
  async job(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("job") job: string) {
    await this.access(me, id);
    const j = await this.jobs.get(job, id);
    if (!j) throw new AppError(404, "planning.noDraft");
    return { id: j.id, status: j.status, error: j.error, result: j.result };
  }

  /** The default prompt template of the household's language and its placeholders (to read it, or start from it). */
  @Get("default-template")
  async defaultTemplate(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    await this.access(me, id);
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id } });
    return { template: DEFAULT_TEMPLATES[h.locale] ?? DEFAULT_TEMPLATES.en, placeholders: [...PLACEHOLDERS] };
  }

  /** The prompt that would be sent (to check the settings), without calling the LLM. */
  @Get("prompt")
  async prompt(@CurrentUser() me: AuthUser, @Param("id") id: string, @Query() q: PeriodDto) {
    await this.access(me, id);
    return { prompt: (await this.planning.prompt(id, q.start.slice(0, 10), q.days)).prompt };
  }
}
