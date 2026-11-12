// Hosted mode: the connectors of a household call addresses typed by that household (calendar, CalDAV, Home Assistant,
// Grocy, OpenAI-compatible…). They must not reach the private network of the platform (SSRF): every address, and every
// redirect, is resolved and refused when it points to a loopback, private, link-local or shared address. The shared
// Mealie of the platform is the only internal address allowed.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { config } from "../config";
import { AppError } from "../i18n/i18n";

const V4_BLOCKED: [string, number][] = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]];
const v4 = (ip: string) => ip.split(".").reduce((n, x) => n * 256 + Number(x), 0);

export function isPrivate(ip: string): boolean {
  if (isIP(ip) === 4) return V4_BLOCKED.some(([net, bits]) => Math.floor(v4(ip) / 2 ** (32 - bits)) === Math.floor(v4(net) / 2 ** (32 - bits)));
  const x = ip.toLowerCase();
  if (x.startsWith("::ffff:")) return isPrivate(x.slice(7));
  if (/^::(\d+\.){3}\d+$/.test(x)) return isPrivate(x.slice(2));   // IPv4-compatible form
  // NAT64 (64:ff9b::/96, 64:ff9b:1::/48) and 6to4 (2002::/16) carry an IPv4 address that may be internal ; discard
  // prefix 100::/64 and documentation 2001:db8::/32 are never a real service
  if (/^64:ff9b:/.test(x) || x.startsWith("2002:") || /^100::/.test(x) || /^100:0:0:0:/.test(x) || /^2001:0?db8:/.test(x)) return true;
  return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff");
}

/** An http(s) address whose name resolves only to public addresses. */
async function isPublic(url: URL): Promise<boolean> {
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host) ? [host] : await lookup(host, { all: true }).then((a) => a.map((x) => x.address)).catch(() => []);
  return ips.length > 0 && !ips.some(isPrivate);
}

async function allowed(url: URL): Promise<boolean> {
  if (!["http:", "https:"].includes(url.protocol)) return false;
  if (config.hosted.mealieUrl && url.origin === new URL(config.hosted.mealieUrl).origin) return true;
  return isPublic(url);
}

/** For an address another service will fetch for us (a recipe imported by Mealie): public addresses only, the shared
 * Mealie itself included. Mealie follows redirects on its own: its outgoing traffic must still be filtered (firewall). */
export async function assertPublicAddress(address: string): Promise<void> {
  let url: URL;
  try { url = new URL(address); } catch { throw new AppError(400, "hosted.privateAddress"); }
  if (!(await isPublic(url))) throw new AppError(400, "hosted.privateAddress");
}

/** fetch() that refuses private addresses, redirects followed by hand (each one checked). */
export async function safeFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  let url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
  for (let hop = 0; hop < 5; hop++) {
    if (!(await allowed(url))) throw new AppError(400, "hosted.privateAddress");
    const r = await fetch(url, { ...init, redirect: "manual" });
    const next = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (!next) return r;
    url = new URL(next, url);
    if (r.status === 303) init = { ...init, method: "GET", body: undefined };
  }
  throw new AppError(400, "hosted.privateAddress");
}

/** Connectors not offered on the hosted version: documents (too sensitive to host for others), the Keep companion. */
export const HOSTED_BLOCKED = ["paperless", "google-keep"];
