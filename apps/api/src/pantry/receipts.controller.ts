// Receipts inbox of a household: send photos / PDF (also from the phone's share menu), list, view, read again, remove,
// check the mailbox now.
import { Controller, Delete, Get, Param, Post, Query, Res, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AuthUser, CurrentUser } from "../auth/decorators";
import { householdAccess } from "../common/access";
import { AppError } from "../i18n/i18n";
import { PrismaService } from "../prisma/prisma.service";
import { MAX_BYTES, ReceiptsService } from "./receipts.service";

interface Upload { originalname: string; mimetype: string; buffer: Buffer; size: number }

@ApiTags("pantry")
@Controller("households/:id/receipts")
export class ReceiptsController {
  constructor(private receipts: ReceiptsService, private prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() me: AuthUser, @Param("id") id: string) { await householdAccess(this.prisma, me, id); return this.receipts.list(id); }

  /** Photos (jpeg, png, webp, heic) and PDF, field « files », 10 at a time, 15 MB each. */
  @Post()
  @UseInterceptors(FilesInterceptor("files", 10, { limits: { fileSize: MAX_BYTES } }))
  async upload(@CurrentUser() me: AuthUser, @Param("id") id: string, @UploadedFiles() files: Upload[]) {
    await householdAccess(this.prisma, me, id);
    if (!files?.length) throw new AppError(400, "receipts.none");
    const out = [];
    for (const f of files) {
      try { out.push({ file: f.originalname, ...(await this.receipts.add(id, { filename: f.originalname, mimeType: f.mimetype, data: f.buffer }, "upload")) }); }
      catch (e) { out.push({ file: f.originalname, error: String((e as { key?: string }).key ?? (e as Error).message) }); }
    }
    return { files: out };
  }

  @Get(":receipt/file")
  async file(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("receipt") receipt: string, @Res() res: Response) {
    await householdAccess(this.prisma, me, id);
    const r = await this.receipts.file(id, receipt);
    if (!r.data.length) throw new AppError(410, "receipts.purged");
    res.setHeader("Content-Type", r.mimeType.startsWith("text/") ? "text/plain; charset=utf-8" : r.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(r.filename)}"`);
    res.setHeader("Content-Security-Policy", "sandbox");
    res.send(Buffer.from(r.data));
  }

  @Post(":receipt/read")
  async retry(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("receipt") receipt: string) {
    await householdAccess(this.prisma, me, id); return this.receipts.retry(id, receipt);
  }

  @Delete(":receipt")
  async remove(@CurrentUser() me: AuthUser, @Param("id") id: string, @Param("receipt") receipt: string) {
    await householdAccess(this.prisma, me, id); return this.receipts.remove(id, receipt);
  }

  @Post("mailbox")
  async mailbox(@CurrentUser() me: AuthUser, @Param("id") id: string, @Query("full") full: string) {
    await householdAccess(this.prisma, me, id); return this.receipts.checkMailbox(id, full === "1");
  }
}
