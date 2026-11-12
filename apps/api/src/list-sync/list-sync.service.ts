// List sync: every 10 minutes (and when the shopping page opens), each enabled list-sync connector of each household
// is synced both ways with the shopping list (sync.ts). Items coming from outside get an aisle guessed from the pantry
// families of the household, then from the word lists of its language. Also the inbound add (voice assistants).
import { JobsService } from "../jobs/jobs.service";
import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { ListSyncConnector } from "@pantarr/connector-sdk";
import { ConnectorsService, IMPLEMENTED } from "../connectors/connectors.service";
import { inFamily, PantryService } from "../pantry/pantry.service";
import { PrismaService } from "../prisma/prisma.service";
import { ShoppingService } from "../shopping/shopping.service";
import { aisleFromWords } from "./aisle-words";
import { plan } from "./sync";

export interface SyncResult { connector: string; added: number; checked: number; removed: number; external: number; error?: string }

/** « lait, œufs et pain » → three items (what a voice assistant sends). */
export function splitDictation(text: string, locale: string): string[] {
  const and = { fr: "et", en: "and" }[locale] ?? "and";
  return text.split(new RegExp(`\\s*(?:,|;|\\n|\\s${and}\\s)\\s*`, "i")).map((x) => x.trim()).filter(Boolean)
    .map((x) => x[0].toUpperCase() + x.slice(1));
}

@Injectable()
export class ListSyncService {
  private log = new Logger("list-sync");
  private running = new Set<string>();
  constructor(private prisma: PrismaService, private connectors: ConnectorsService, private shopping: ShoppingService, private pantry: PantryService,
              private jobs: JobsService) {}

  /** Aisle of an item typed elsewhere: pantry family of the household, else the word lists of its language. */
  async aisleOf(householdId: string, locale: string, text: string): Promise<string | undefined> {
    const families = await this.prisma.pantryFamily.findMany({ where: { householdId }, orderBy: { position: "asc" } });
    return families.find((f) => inFamily(text, f))?.aisle ?? aisleFromWords(text, locale) ?? undefined;
  }

  /** Items dictated or typed elsewhere, added to the shopping list (origin « list-sync »). */
  async addText(householdId: string, text: string, source: string) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    const added: string[] = [];
    for (const t of splitDictation(text, h.locale)) {
      await this.shopping.insert(householdId, t, await this.aisleOf(householdId, h.locale, t), undefined, { pantarr_origin: "list-sync", pantarr_source: source });
      added.push(t);
    }
    return { added };
  }

  async syncHousehold(householdId: string): Promise<SyncResult[]> {
    if (this.running.has(householdId)) return [];
    this.running.add(householdId);
    try {
      const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
      const enabled = await this.prisma.connectorInstance.findMany({ where: { householdId, kind: "list-sync", enabled: true } });
      const out: SyncResult[] = [];
      for (const i of enabled) {
        const c = (IMPLEMENTED as unknown as Record<string, ListSyncConnector>)[i.moduleId];
        if (!c?.pull) continue;
        try {
          out.push(await this.syncOne(householdId, h.locale, i.moduleId, c));
        } catch (e) {
          this.log.warn(`${householdId} ${i.moduleId}: ${(e as Error).message}`);
          out.push({ connector: i.moduleId, added: 0, checked: 0, removed: 0, external: 0, error: (e as Error).message });
        }
      }
      return out;
    } finally {
      this.running.delete(householdId);
    }
  }

  private async syncOne(householdId: string, locale: string, moduleId: string, c: ListSyncConnector): Promise<SyncResult> {
    const ctx = await this.connectors.require(householdId, moduleId, locale);
    const outside = await c.pull!(ctx);
    const { items } = await this.shopping.list(householdId);
    const links = await this.prisma.listSyncLink.findMany({ where: { householdId, moduleId } });
    const p = plan(links, outside, items.filter((x): x is typeof x & { id: string } => !!x.id));
    for (const x of p.check) {
      const item = await this.shopping.check(householdId, x.itemId, x.checked);
      if (x.checked) await this.pantry.bought(householdId, item);
    }
    for (const id of p.remove) await this.shopping.remove(householdId, id);
    for (const e of p.add) {
      const itemId = await this.shopping.insert(householdId, e.text[0].toUpperCase() + e.text.slice(1), await this.aisleOf(householdId, locale, e.text), undefined,
        { pantarr_origin: "list-sync", pantarr_source: moduleId });
      if (itemId) p.links.push({ externalId: e.id, itemId, extChecked: false, itemChecked: false });
    }
    if (p.external.length && c.setChecked) await c.setChecked(ctx, p.external);
    await this.prisma.$transaction([
      this.prisma.listSyncLink.deleteMany({ where: { householdId, moduleId } }),
      this.prisma.listSyncLink.createMany({ data: p.links.map((l) => ({ ...l, householdId, moduleId })), skipDuplicates: true }),
    ]);
    return { connector: moduleId, added: p.add.length, checked: p.check.length, removed: p.remove.length, external: p.external.length };
  }

  @Interval(10 * 60 * 1000)
  async syncAll() {
    await this.jobs.exclusive("list-sync", 9, async () => {   // one server at a time
      const rows = await this.prisma.connectorInstance.findMany({ where: { kind: "list-sync", enabled: true, householdId: { not: null } }, select: { householdId: true }, distinct: ["householdId"] });
      for (const r of rows) await this.syncHousehold(r.householdId!).catch((e) => this.log.warn((e as Error).message));
    });
  }
}
