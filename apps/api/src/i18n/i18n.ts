// API messages translated from Accept-Language (or the user's locale). Add a language: drop <lang>.json here.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HttpException } from "@nestjs/common";

const catalogues: Record<string, Record<string, string>> = {};
for (const f of readdirSync(__dirname).filter((x) => x.endsWith(".json"))) {
  catalogues[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(__dirname, f), "utf8"));
}
export const languages = Object.keys(catalogues);

export function pickLocale(header?: string, fallback = "en"): string {
  for (const part of (header ?? "").split(",")) {
    const lang = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (catalogues[lang]) return lang;
  }
  return catalogues[fallback] ? fallback : "en";
}

export function t(key: string, locale = "en"): string {
  return catalogues[locale]?.[key] ?? catalogues.en?.[key] ?? key;
}

/** Error whose message is a catalogue key, translated by the exception filter. */
export class AppError extends HttpException {
  constructor(status: number, public readonly key: string) { super(key, status); }
}
