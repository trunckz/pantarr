// Connectors from outside the image (self-hosted only): every folder or .js file of PANTARR_CONNECTORS_DIR is loaded at
// start; it exports one connector or a list (default export, « connector » or « connectors »), written against
// @pantarr/connector-sdk (docs/connectors.md). A connector takes the place of a planned one of the same id, never of a
// built-in one. Plugins run with the rights of Pantarr: install only code you trust. Off in hosted mode.
import { Logger } from "@nestjs/common";
import type { ConnectorManifest } from "@pantarr/connector-sdk";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { IMPLEMENTED } from "./connectors.service";
import { BUILT_IN } from "./registry";

const KINDS = ["recipes", "llm", "calendar", "documents", "purchases", "cart", "list-sync", "inventory"];
type Loaded = { manifest: ConnectorManifest };

function exported(mod: Record<string, unknown>): Loaded[] {
  const x = (mod.default ?? mod.connectors ?? mod.connector ?? mod) as unknown;
  return (Array.isArray(x) ? x : [x]).filter((c): c is Loaded => !!c && typeof c === "object" && "manifest" in (c as object));
}

/** Loads the plugins of a folder; returns the ids added. */
export function loadPlugins(dir: string, log = new Logger("plugins")): string[] {
  if (!dir || !existsSync(dir)) return [];
  const implemented = IMPLEMENTED as unknown as Record<string, Loaded>, added: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const path = resolve(join(dir, entry));
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      for (const c of exported(require(path))) {
        const m = c.manifest;
        if (!m?.id || !KINDS.includes(m.kind) || !m.name || typeof m.settings !== "object") { log.warn(`${entry}: invalid manifest`); continue; }
        if (implemented[m.id]) { log.warn(`${entry}: « ${m.id} » is a built-in connector, skipped`); continue; }
        implemented[m.id] = c;
        const planned = BUILT_IN.findIndex((x) => x.id === m.id);
        if (planned >= 0) BUILT_IN.splice(planned, 1, m); else BUILT_IN.push(m);
        added.push(m.id);
        log.log(`${m.id} (${m.kind}) loaded from ${entry}`);
      }
    } catch (e) {
      log.warn(`${entry}: ${(e as Error).message}`);
    }
  }
  return added;
}
