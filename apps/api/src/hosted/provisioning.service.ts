// Hosted mode: each household gets its own group in the shared Mealie (recipes, meal plans and lists kept apart), with
// a technical user whose API token is stored (encrypted) in the household's Mealie connector. Its password is random
// and never kept. Removing the household removes the user, then the group.
import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { config } from "../config";
import { ConnectorsService } from "../connectors/connectors.service";
import { StarterService } from "../recipes/starter.service";
import { PrismaService } from "../prisma/prisma.service";

const SHOPPING_LIST: Record<string, string> = { fr: "Courses", en: "Shopping" };

@Injectable()
export class ProvisioningService implements OnApplicationBootstrap {
  private log = new Logger("provisioning");
  constructor(private prisma: PrismaService, private connectors: ConnectorsService, private starter: StarterService) {}

  /** A household left without its Mealie group (made before the creation provisioned it): provisioned at start, once
   * its owner's address is checked (a sign-up not confirmed gets nothing). A moment later: the platform's Mealie set
   * in the administration is applied first. */
  onApplicationBootstrap() {
    if (config.mode !== "hosted") return;
    setTimeout(() => void this.catchUp(), 5000);
  }

  async catchUp() {
    if (!this.enabled) return;
    const missing = await this.prisma.household.findMany({ where: { mealieGroupId: null, memberships: { some: { role: "owner", user: { emailVerifiedAt: { not: null } } } } }, select: { id: true } });
    for (const h of missing) await this.provision(h.id).catch((e) => this.log.warn(`household ${h.id}: ${(e as Error).message}`));
  }

  get enabled() { return config.mode === "hosted" && !!config.hosted.mealieUrl && !!config.hosted.mealieAdminToken; }

  private async mealie<T>(method: string, path: string, body?: unknown, token = config.hosted.mealieAdminToken, form = false): Promise<T> {
    const r = await fetch(`${config.hosted.mealieUrl}${path}`, { method, signal: AbortSignal.timeout(30000),
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" } : {}) },
      body: body ? (form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body)) : undefined });
    if (!r.ok) throw new Error(`Mealie ${method} ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return (r.status === 204 ? null : await r.json()) as T;
  }

  /** Group + technical user + API token → the Mealie connector of the household. Idempotent (does nothing twice). */
  async provision(householdId: string) {
    if (!this.enabled) return;
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    if (h.mealieGroupId) return;
    const group = await this.mealie<{ id: string }>("POST", "/api/admin/groups", { name: `pantarr-${h.id}` });
    const email = `pantarr-${h.id}@households.invalid`, password = randomBytes(24).toString("base64url");
    await this.mealie("POST", "/api/admin/users", { username: `pantarr-${h.id}`, fullName: h.name, email, password, admin: false, group: `pantarr-${h.id}`,
      advanced: false, canInvite: false, canManage: true, canOrganize: true });
    const session = await this.mealie<{ access_token: string }>("POST", "/api/auth/token", { username: email, password }, "", true);
    const token = await this.mealie<{ token: string }>("POST", "/api/users/api-tokens", { name: "pantarr" }, session.access_token);
    await this.connectors.write(householdId, "mealie", true, { url: config.hosted.mealieUrl, token: token.token, shoppingList: SHOPPING_LIST[h.locale] ?? SHOPPING_LIST.en });
    await this.prisma.household.update({ where: { id: householdId }, data: { mealieGroupId: group.id } });
    this.log.log(`household ${householdId}: Mealie group ${group.id}`);
    // a new household does not start with an empty recipe book: the starter recipes, in the background
    await this.starter.start(householdId).catch((e) => this.log.warn(`starter recipes: ${(e as Error).message}`));
  }

  /** The household's Mealie group and user, before the household itself is deleted. */
  async remove(householdId: string) {
    if (!this.enabled) return;
    const h = await this.prisma.household.findUnique({ where: { id: householdId } });
    if (!h?.mealieGroupId) return;
    const users = await this.mealie<{ items: { id: string; email: string }[] }>("GET", `/api/admin/users?perPage=-1&queryFilter=${encodeURIComponent(`email = "pantarr-${h.id}@households.invalid"`)}`);
    for (const u of users.items.filter((x) => x.email === `pantarr-${h.id}@households.invalid`)) await this.mealie("DELETE", `/api/admin/users/${u.id}`);
    await this.mealie("DELETE", `/api/admin/groups/${h.mealieGroupId}`);
  }
}
