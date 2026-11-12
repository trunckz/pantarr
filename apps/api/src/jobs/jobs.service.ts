// Background jobs (LLM calls): stored in the database so that a closed page finds the result, one running job per
// key (e.g. one proposal per household and period: a second request returns the running job instead of a new call).
import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const STALE_MS = 15 * 60e3;

@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private log = new Logger("jobs");
  constructor(private prisma: PrismaService) {}

  /** Jobs cut by a restart: failed, their key released. */
  async onApplicationBootstrap() {
    // (scheduled tasks are left alone: another server may be running them ; a dead one expires by its time limit)
    const r = await this.prisma.job.updateMany({ where: { status: { in: ["queued", "running"] }, kind: { not: "scheduled" } },
      data: { status: "failed", error: "interrupted (server restarted)", key: null, finishedAt: new Date() } });
    if (r.count) this.log.warn(`${r.count} interrupted job(s) marked as failed`);
  }

  async start(kind: string, key: string, householdId: string, payload: Record<string, unknown>, work: () => Promise<unknown>) {
    const running = await this.prisma.job.findUnique({ where: { key } });
    if (running && Date.now() - running.createdAt.getTime() < STALE_MS) return running;
    if (running) await this.prisma.job.update({ where: { id: running.id }, data: { status: "failed", error: "timed out", key: null } });
    const job = await this.prisma.job.create({ data: { kind, key, householdId, payload: payload as Prisma.InputJsonValue, status: "running" } });
    void (async () => {
      try {
        const result = await work();
        await this.prisma.job.update({ where: { id: job.id }, data: { status: "done", result: (result ?? null) as Prisma.InputJsonValue, key: null, finishedAt: new Date() } });
      } catch (e) {
        this.log.warn(`${kind} ${job.id}: ${(e as Error).message}`);
        await this.prisma.job.update({ where: { id: job.id }, data: { status: "failed", error: String((e as { key?: string }).key ?? (e as Error).message).slice(0, 500), key: null, finishedAt: new Date() } });
      }
    })();
    return job;
  }

  /** A scheduled task (@Cron, @Interval) run by one server at a time: with several replicas, the others skip it. The
   * unique key of the Job table is the lock ; a lock older than « maxMinutes » (server stopped mid-way) is taken over. */
  async exclusive(name: string, maxMinutes: number, work: () => Promise<unknown>): Promise<boolean> {
    const key = `scheduled:${name}`;
    let job;
    try {
      job = await this.prisma.job.create({ data: { kind: "scheduled", key, status: "running", payload: { name } } });
    } catch {
      const held = await this.prisma.job.findUnique({ where: { key } });
      if (held && Date.now() - held.createdAt.getTime() < maxMinutes * 60e3) return false;   // running elsewhere
      if (held) await this.prisma.job.updateMany({ where: { id: held.id, key }, data: { status: "failed", error: "timed out", key: null } });
      try { job = await this.prisma.job.create({ data: { kind: "scheduled", key, status: "running", payload: { name } } }); }
      catch { return false; }   // another server took it over first
    }
    try {
      await work();
      await this.prisma.job.update({ where: { id: job.id }, data: { status: "done", key: null, finishedAt: new Date() } });
    } catch (e) {
      await this.prisma.job.update({ where: { id: job.id }, data: { status: "failed", error: (e as Error).message.slice(0, 500), key: null, finishedAt: new Date() } });
      this.log.warn(`${name}: ${(e as Error).message}`);
    }
    return true;
  }

  get(id: string, householdId: string) { return this.prisma.job.findFirst({ where: { id, householdId } }); }
  running(key: string) { return this.prisma.job.findUnique({ where: { key } }); }
  lastFailed(householdId: string, kind: string, since: Date) {
    return this.prisma.job.findFirst({ where: { householdId, kind, status: "failed", createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });
  }
}
