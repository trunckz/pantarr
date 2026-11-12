// Outgoing mail (sign-up check, invitations), in the language of the recipient. Without PANTARR_SMTP_URL the
// message is only logged (development, or an instance that does not need it).
import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { config } from "../config";
import { t } from "../i18n/i18n";

@Injectable()
export class MailerService {
  private log = new Logger("mail");
  private transport: Transporter | null = config.smtpUrl ? createTransport(config.smtpUrl) : null;
  /** Last messages (tests, and the log of an instance without SMTP). */
  readonly sent: { to: string; subject: string; text: string }[] = [];

  async send(to: string, locale: string, kind: "verify" | "invite" | "reset" | "test", vars: Record<string, string>) {
    const fill = (k: string) => t(k, locale).replace(/\{(\w+)\}/g, (_, v: string) => vars[v] ?? "");
    const subject = fill(`mail.${kind}.subject`), text = fill(`mail.${kind}.text`);
    this.sent.push({ to, subject, text });
    if (this.sent.length > 50) this.sent.shift();
    if (!this.transport) { this.log.warn(`no SMTP: « ${subject} » to ${to}: ${vars.link ?? ""}`); return; }
    await this.transport.sendMail({ from: config.mailFrom, to, subject, text });
  }
}
