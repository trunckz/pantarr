// Browser extension (Chrome, Edge, Firefox; Manifest V3) built by the instance from the store scripts: the same code
// as the userscripts, run in the page of each store site, with the Pantarr address, the bridge key and the household
// given by the extension once connected (code shown in Pantarr) instead of written in the script. The archive is the
// one sent to the Chrome Web Store and to Firefox Add-ons; its default address is this instance's.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { config } from "../config";
import { IMPLEMENTED } from "../connectors/connectors.service";
import { RECIPE_SITES } from "../recipes/recipe-sites";

export const EXTENSION_VERSION = "1.4.0";

const ICONS = { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" };

const API = "@@PANTARR_API@@", KEY = "@@PANTARR_KEY@@", HOUSEHOLD = "PANTARRHOUSEHOLD";

interface BridgeConnector { manifest: { id: string; bridge?: boolean; origins?: string[] }; bridgeScript?: (c: { api: string; key: string; version: string; household?: string }) => string }

/** A userscript made into a page-world content script: waits for the configuration given by bridge.js, then runs. */
export function pageScript(userscript: string): string {
  const body = userscript.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n?/, "")
    .replaceAll(`"Bearer ${KEY}"`, `"Bearer " + __cfg.key`).replaceAll(`"${API}"`, "__cfg.api").replaceAll(`"${HOUSEHOLD}"`, "__cfg.household");
  if (body.includes(API) || body.includes(KEY) || body.includes(HOUSEHOLD)) throw new Error("a configuration value is used in an unknown way");
  return `// Pantarr extension: store script (page world), started once the extension's configuration is known.
(() => {
  let started = false;
  const start = (e) => {
    if (started) return;
    let c = null; try { c = JSON.parse(e.detail); } catch (x) { return; }
    if (!c || !c.api || !c.key) return;
    started = true;
    run(c);
  };
  document.addEventListener("pantarr-config", start);
  document.dispatchEvent(new CustomEvent("pantarr-config-request"));
  function run(__cfg) {
${body}
  }
})();
`;
}

/** Content patterns of the origins of a connector (« https://*.leclercdrive.fr » → « https://*.leclercdrive.fr/* »). */
const matchesOf = (origins: string[]) => origins.map((o) => `${o.replace(/\/$/, "")}/*`);

/** Browsers an archive is made for: « any » (loaded by hand, or this instance's download) keeps every key. */
export type ExtensionTarget = "any" | "chrome" | "firefox";

/** What the extension sends, for Firefox's data consent (shown at install): the content of the store pages (basket,
 * products) and of the recipe pages, and the purchases (receipts), always to the user's own Pantarr. */
export const DATA_COLLECTION = { required: ["websiteContent", "financialAndPaymentInfo"] };

/** Files of the extension: manifest, popup, configuration bridge, one script per store. `base` is the Pantarr the
 * extension talks to by default ; empty (store build for everyone) : the user types the address of their Pantarr. */
export function extensionFiles(base: string = config.baseUrl, target: ExtensionTarget = "any"): Record<string, Buffer> {
  const dir = join(__dirname, "static");
  const files: Record<string, Buffer> = {};
  const scripts: { matches: string[]; js: string[]; run_at: string; world: string }[] = [];
  const all = new Set<string>();
  for (const c of Object.values(IMPLEMENTED as unknown as Record<string, BridgeConnector>)) {
    if (!c.manifest.bridge || typeof c.bridgeScript !== "function" || !c.manifest.origins?.length) continue;
    const id = c.manifest.id, matches = matchesOf(c.manifest.origins);
    files[`stores/${id}.js`] = Buffer.from(pageScript(c.bridgeScript({ api: API, key: KEY, version: `ext-${EXTENSION_VERSION}`, household: HOUSEHOLD })));
    // the Lidl receipts are read once the page is there ; the carts watch the site's own requests from the start
    scripts.push({ matches, js: [`stores/${id}.js`], run_at: id === "lidl-plus" ? "document_idle" : "document_start", world: "MAIN" });
    matches.forEach((m) => all.add(m));
  }
  // the recipe sites: a button to add the recipe of the page (isolated world: the page's rules do not apply)
  const recipeMatches = RECIPE_SITES.flatMap((x) => matchesOf(x.origins));
  files["recipes.js"] = Buffer.from(readFileSync(join(dir, "recipes.js"), "utf8").replace("const SITES = __RECIPE_SITES__;", () => `const SITES = ${JSON.stringify(RECIPE_SITES)};`));
  recipeMatches.forEach((m) => all.add(m));
  const origin = base ? new URL(base).origin : "";
  const manifest = {
    manifest_version: 3, name: "Pantarr", version: EXTENSION_VERSION,
    description: "Pantarr: fills your online grocery basket from your Pantarr shopping list, adds recipes from recipe sites, and sends your Lidl Plus receipts to Pantarr.",
    icons: ICONS, action: { default_popup: "popup.html", default_icon: ICONS },
    permissions: ["storage"],
    host_permissions: [...all, ...(origin ? [`${origin}/*`] : [])],
    content_scripts: [{ matches: [...all], js: ["bridge.js"], run_at: "document_start" }, ...scripts,
      { matches: recipeMatches, js: ["recipes.js"], run_at: "document_idle" }],
    ...(target === "chrome" ? {} : { browser_specific_settings: { gecko: { id: "extension@pantarr.app", strict_min_version: "140.0", data_collection_permissions: DATA_COLLECTION } } }),
  };
  files["manifest.json"] = Buffer.from(JSON.stringify(manifest, null, 2));
  files["bridge.js"] = readFileSync(join(dir, "bridge.js"));
  files["popup.html"] = readFileSync(join(dir, "popup.html"));
  files["popup.js"] = Buffer.from(readFileSync(join(dir, "popup.js"), "utf8").replace("__DEFAULT_BASE__", origin));
  for (const f of Object.values(ICONS)) files[f] = readFileSync(join(dir, f));
  return files;
}

// ── A small ZIP writer (deflate), enough for an extension archive ──
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files: Record<string, Buffer>): Buffer {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = Buffer.from(name, "utf8"), packed = deflateRawSync(data), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26); local.writeUInt16LE(0, 28);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(0x0800, 8); head.writeUInt16LE(8, 10);
    head.writeUInt32LE(0, 12); head.writeUInt32LE(crc, 16); head.writeUInt32LE(packed.length, 20); head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(n.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, n, packed); central.push(head, n);
    offset += local.length + n.length + packed.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22), count = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}
