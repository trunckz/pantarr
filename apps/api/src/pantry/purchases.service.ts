// Import of purchases: documents of the stores (documents connector, e.g. Paperless) read by the purchases connector of
// each store (e.g. Intermarché) → products and purchases. Re-reading a document replaces its purchases (idempotent).
// Every night for every household that has both connectors, and on demand.
import { JobsService } from "../jobs/jobs.service";
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { PurchasesConnector } from "@pantarr/connector-sdk";
import { Prisma } from "@prisma/client";
import { ConnectorsService, IMPLEMENTED } from "../connectors/connectors.service";
import { paperlessConnector } from "../connectors/documents/paperless.connector";
import { settingsOf } from "../households/households.defaults";
import { AppError } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PurchasesService {
  private log = new Logger("purchases");
  constructor(private prisma: PrismaService, private connectors: ConnectorsService, private jobs: JobsService) {}

  async import(householdId: string, full = false) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id: householdId } });
    const docs = await this.connectors.context(householdId, "paperless", h.locale);
    if (!docs) throw new AppError(409, "purchases.noDocuments");
    const s = settingsOf(h) as ReturnType<typeof settingsOf> & { purchasesImportedUntil?: string };
    const since = full || !s.purchasesImportedUntil ? undefined
      : new Date(Date.parse(s.purchasesImportedUntil) - 3 * 864e5).toISOString().slice(0, 10);
    let documents = 0, purchases = 0;
    // Every purchases connector that reads documents (Intermarché, generic receipts, plugins…)
    const readers = Object.entries(IMPLEMENTED as unknown as Record<string, PurchasesConnector>).filter(([, c]) => c.manifest.kind === "purchases" && c.parse);
    for (const [moduleId, connector] of readers) {
      const ctx = await this.connectors.context(householdId, moduleId, h.locale);
      if (!ctx) continue;
      const stores = String(ctx.settings.correspondent || connector.manifest.name).split(",").map((x) => x.trim()).filter(Boolean);
      for (const doc of await paperlessConnector.purchaseDocuments(docs, { stores, since })) {
        const lines = connector.parse!(ctx, { contentType: "application/json", text: JSON.stringify(doc) });
        const externalId = `paperless:${doc.id}`;
        await this.prisma.purchase.deleteMany({ where: { externalId, product: { householdId, connector: moduleId } } });
        for (const p of lines) {
          const product = await this.prisma.product.upsert({
            where: { householdId_connector_label: { householdId, connector: moduleId, label: p.label } },
            create: { householdId, connector: moduleId, label: p.label, brand: p.brand, channel: p.channel },
            update: {} });
          await this.prisma.purchase.create({ data: { productId: product.id, date: new Date(p.date), quantity: p.quantity, unitPrice: p.unitPrice, externalId } });
        }
        documents++; purchases += lines.length;
      }
    }
    await this.prisma.household.update({ where: { id: householdId }, data: { settings: { ...(h.settings as object), purchasesImportedUntil: new Date().toISOString().slice(0, 10) } as Prisma.InputJsonValue } });
    return { documents, purchases };
  }

  @Cron("30 5 * * *")
  async nightly() {
    await this.jobs.exclusive("purchases-import", 120, async () => {   // one server at a time
      // every household that reaches a document manager: its own, or the instance's
      for (const h of await this.prisma.household.findMany({ select: { id: true } })) {
        if (!(await this.connectors.context(h.id, "paperless"))) continue;
        try { const r = await this.import(h.id); this.log.log(`${h.id}: ${r.documents} documents, ${r.purchases} purchases`); }
        catch (e) { this.log.warn(`${h.id}: ${(e as Error).message}`); }
      }
    });
  }
}
