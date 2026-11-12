// Shared lists: sync now (the shopping page asks when it opens), and the inbound add of the voice assistants
// (Apple Shortcuts / Siri, Tasker, Home Assistant automations…) with a « bridge » key of the user.
import { Body, Controller, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";
import { AuthUser, CurrentUser } from "../auth/decorators";
import { householdAccess } from "../common/access";
import { AppError } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";
import { ListSyncService } from "./list-sync.service";

class AddDto { @IsString() @MaxLength(500) text: string }

@ApiTags("shopping")
@Controller()
export class ListSyncController {
  constructor(private prisma: PrismaService, private sync: ListSyncService) {}

  @Post("households/:id/list-sync")
  async now(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    await householdAccess(this.prisma, me, id);
    return { results: await this.sync.syncHousehold(id) };
  }

  /** « Add milk and eggs »: one item per thing named; household = the given one, else the user's first one. */
  @Post("bridge/list/add")
  async add(@CurrentUser() me: AuthUser, @Body() b: AddDto, @Query("household") household?: string) {
    const id = household ?? (await this.prisma.membership.findFirst({ where: { userId: me.id }, orderBy: { householdId: "asc" } }))?.householdId;
    if (!id) throw new AppError(404, "households.notFound");
    await householdAccess(this.prisma, me, id);
    return this.sync.addText(id, b.text, "voice");
  }
}
