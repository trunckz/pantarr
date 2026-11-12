// Secrets of connector instances (API tokens, passwords) encrypted at rest with a key derived from PANTARR_SECRET
// (AES-256-GCM). Changing PANTARR_SECRET makes them unreadable: they must then be entered again.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "../config";

const key = () => createHash("sha256").update("pantarr-connector-secrets:" + config.secret).digest();

export function encrypt(value: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(blob: string | null | undefined): Record<string, unknown> {
  if (!blob) return {};
  try {
    const [iv, tag, data] = blob.split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString("utf8"));
  } catch {
    return {};
  }
}
