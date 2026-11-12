import type { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/decorators";
import { Logger } from "@nestjs/common";
import { AppError } from "../i18n/i18n";

const audit = new Logger("admin-access");
const seen = new Map<string, number>();

/** A platform administrator opening a household they are not a member of (support): written to the log, once an
 * hour per administrator and household, so that who looked at which family's data can be told afterwards. */
export async function noteAdminAccess(prisma: PrismaService, me: AuthUser, householdId: string, what: string): Promise<void> {
  if (me.role !== "ADMIN") return;
  const k = `${me.id}|${householdId}`;
  if ((seen.get(k) ?? 0) > Date.now() - 3600e3) return;
  if (await prisma.membership.findUnique({ where: { userId_householdId: { userId: me.id, householdId } } })) return;
  seen.set(k, Date.now());
  audit.log(JSON.stringify({ event: "admin-household-access", admin: me.email, adminId: me.id, household: householdId, what, at: new Date().toISOString() }));
}

/** Administrators reach every household, users only theirs. */
export async function householdAccess(prisma: PrismaService, me: AuthUser, id: string) {
  const h = await prisma.household.findUnique({ where: { id } });
  if (!h) throw new AppError(404, "households.notFound");
  if (me.role !== "ADMIN" && !(await prisma.membership.findUnique({ where: { userId_householdId: { userId: me.id, householdId: id } } }))) {
    throw new AppError(403, "auth.forbidden");
  }
  await noteAdminAccess(prisma, me, id, "household data");
  return h;
}
