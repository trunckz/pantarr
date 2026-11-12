import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import type { Request, Response } from "express";
import { AppError, pickLocale, t } from "../i18n/i18n";

/** Translates AppError keys; other HTTP errors keep their message. */
@Catch(HttpException)
export class I18nFilter implements ExceptionFilter {
  catch(e: HttpException, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request & { user?: { locale?: string } }>();
    const res = host.switchToHttp().getResponse<Response>();
    const locale = req.user?.locale ?? pickLocale(req.headers["accept-language"]);
    const body = e.getResponse();
    const message = e instanceof AppError ? t(e.key, locale) : typeof body === "string" ? body : (body as { message?: unknown }).message;
    res.status(e.getStatus()).json({ statusCode: e.getStatus(), message, ...(e instanceof AppError ? { code: e.key } : {}) });
  }
}
