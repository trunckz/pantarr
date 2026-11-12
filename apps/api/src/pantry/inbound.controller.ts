// Forwarding address of a household (see inbound.ts): shown, created or renewed, removed by its admins ; mails posted
// by the domain's mail service (raw, with the instance's secret) into the receipts inbox.
import { timingSafeEqual } from "node:crypto";
import { Controller, Delete, Get, HttpCode, Logger, Param, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { simpleParser } from "mailparser";
import { Prisma } from "@prisma/client";
import { HouseholdAdmin, Public } from "../auth/decorators";
import { config } from "../config";
import { documentsOf } from "../connectors/mailbox/mailbox.connector";
import { AppError } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";
import { addressOf, gmailConfirmation, newCode, recipientCode, STORE_FILTER } from "./inbound";
import { ReceiptsService } from "./receipts.service";

const LIMIT = 26 * 1024 * 1024;

/** Raw body of a request no parser read (application/octet-stream, message/rfc822), at most « limit » bytes. */
export async function rawBody(req: Request, limit = LIMIT): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req as AsyncIterable<Buffer>) {
    size += c.length;
    if (size > limit) throw new AppError(413, "receipts.tooBig");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

const sameSecret = (a: string, b: string) => !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

@ApiTags("pantry")
@Controller()
export class InboundController {
  private log = new Logger("inbound");
  constructor(private prisma: PrismaService, private receipts: ReceiptsService) {}

  private view(h: { inboundCode: string | null; inboundConfirm: unknown }) {
    return { available: !!config.inbound.domain, address: h.inboundCode && config.inbound.domain ? addressOf(h.inboundCode) : null,
      confirmation: h.inboundConfirm ?? null, filter: STORE_FILTER };
  }

  @HouseholdAdmin() @Get("households/:id/inbound")
  async get(@Param("id") id: string) {
    return this.view(await this.prisma.household.findUniqueOrThrow({ where: { id } }));
  }

  /** New address (the old one stops working): also the way to stop unwanted mails. */
  @HouseholdAdmin() @Post("households/:id/inbound")
  async create(@Param("id") id: string) {
    if (!config.inbound.domain) throw new AppError(404, "inbound.unavailable");
    return this.view(await this.prisma.household.update({ where: { id }, data: { inboundCode: newCode(), inboundConfirm: Prisma.DbNull } }));
  }

  @HouseholdAdmin() @Delete("households/:id/inbound")
  async remove(@Param("id") id: string) {
    return this.view(await this.prisma.household.update({ where: { id }, data: { inboundCode: null, inboundConfirm: Prisma.DbNull } }));
  }

  /** A mail for one of the addresses, posted raw by the mail service of the domain (header « X-Pantarr-To »: recipient). */
  @Public() @Post("inbound/mail") @HttpCode(200)
  async mail(@Req() req: Request) {
    const auth = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!config.inbound.domain || !sameSecret(auth, config.inbound.secret)) throw new AppError(401, "auth.required");
    const code = recipientCode(String(req.headers["x-pantarr-to"] ?? ""));
    const h = code ? await this.prisma.household.findUnique({ where: { inboundCode: code } }) : null;
    if (!h) throw new AppError(404, "inbound.unknown");
    const source = await rawBody(req);
    const mail = await simpleParser(source);
    const confirm = gmailConfirmation(mail.from?.text ?? "", mail.subject ?? "", String(mail.text ?? ""));
    if (confirm) {
      await this.prisma.household.update({ where: { id: h.id }, data: { inboundConfirm: { ...confirm, at: new Date().toISOString() } } });
      return { ok: true, confirmation: true };
    }
    let added = 0;
    for (const d of await documentsOf(source, 0)) {
      try { if (!(await this.receipts.add(h.id, { filename: d.filename, mimeType: d.mimeType, data: d.data }, "email")).duplicate) added++; }
      catch (e) { this.log.warn(`${h.id}: ${(e as Error).message}`); }
    }
    return { ok: true, added };
  }
}
