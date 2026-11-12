// Admin settings page: general settings and single sign-on. Secrets are never sent back (masked).
import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators";
import { OIDC_DEFAULTS } from "../auth/oidc.service";
import { config } from "../config";
import { AppError } from "../i18n/i18n";
import { SettingsService } from "./settings.service";

const MASK = "********";
const DEFAULTS: Record<string, Record<string, unknown>> = {
  general: { defaultLocale: "en", registration: false, llmMonthlyCalls: null, announcement: "" },
  oidc: { ...OIDC_DEFAULTS },
};
const SECRETS: Record<string, string[]> = { oidc: ["clientSecret"] };

@ApiTags("settings")
@Roles("ADMIN")
@Controller("settings")
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get(":key")
  async read(@Param("key") key: string) {
    if (!DEFAULTS[key]) throw new AppError(404, "validation.failed");
    const v = { ...DEFAULTS[key], ...((await this.settings.get(key)) as Record<string, unknown> | null ?? {}) };
    for (const s of SECRETS[key] ?? []) if (v[s]) v[s] = MASK;
    return v;
  }

  @Put(":key")
  async write(@Param("key") key: string, @Body() body: Record<string, unknown>) {
    if (!DEFAULTS[key]) throw new AppError(404, "validation.failed");
    if (key === "oidc" && config.mode === "hosted") throw new AppError(403, "hosted.blocked");
    const old = (await this.settings.get(key)) as Record<string, unknown> | null ?? {};
    const v: Record<string, unknown> = {};
    for (const k of Object.keys(DEFAULTS[key])) if (k in body) v[k] = body[k];
    for (const s of SECRETS[key] ?? []) if (v[s] === MASK) v[s] = old[s];   // unchanged secret
    await this.settings.set(key, { ...old, ...v });
    return this.read(key);
  }
}
