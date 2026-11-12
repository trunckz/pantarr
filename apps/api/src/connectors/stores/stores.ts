// Online stores without a dedicated script (France): one « cart » connector each, sharing the learning userscript
// (store.user.js): it learns the site's own search and add-to-basket in the user's browser, else assisted mode. The
// search page is only a first guess: the script learns the real one from the user's own search.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CartConnector } from "@pantarr/connector-sdk";

export interface Store { id: string; name: string; matches: string[]; origins: string[]; siteUrl: string; searchPage: string }

export const STORES: Store[] = [
  { id: "leclerc-cart", name: "E.Leclerc Drive", matches: ["https://www.leclercdrive.fr/*", "https://*.leclercdrive.fr/*"],
    origins: ["https://www.leclercdrive.fr", "https://*.leclercdrive.fr"], siteUrl: "https://www.leclercdrive.fr/", searchPage: "https://www.leclercdrive.fr/recherche?q={q}" },
  { id: "carrefour-cart", name: "Carrefour", matches: ["https://www.carrefour.fr/*"], origins: ["https://www.carrefour.fr"],
    siteUrl: "https://www.carrefour.fr/courses", searchPage: "https://www.carrefour.fr/s?q={q}" },
  { id: "auchan-cart", name: "Auchan", matches: ["https://www.auchan.fr/*"], origins: ["https://www.auchan.fr"],
    siteUrl: "https://www.auchan.fr/", searchPage: "https://www.auchan.fr/recherche?text={q}" },
  { id: "coursesu-cart", name: "Courses U (Super U, Hyper U, U Express)", matches: ["https://www.coursesu.com/*"], origins: ["https://www.coursesu.com"],
    siteUrl: "https://www.coursesu.com/", searchPage: "https://www.coursesu.com/recherche?q={q}" },
  { id: "chronodrive-cart", name: "Chronodrive", matches: ["https://www.chronodrive.com/*"], origins: ["https://www.chronodrive.com"],
    siteUrl: "https://www.chronodrive.com/", searchPage: "https://www.chronodrive.com/search/{q}" },
  { id: "monoprix-cart", name: "Monoprix (courses en ligne)", matches: ["https://courses.monoprix.fr/*"], origins: ["https://courses.monoprix.fr"],
    siteUrl: "https://courses.monoprix.fr/", searchPage: "https://courses.monoprix.fr/search?q={q}" },
];

const script = () => readFileSync(join(__dirname, "store.user.js"), "utf8");

/** The userscript of a store, configured for the user (Pantarr address, bridge key). */
export function storeScript(s: Store, o: { api: string; key: string; version: string }): string {
  return script()
    .replace("// __MATCHES__", s.matches.map((m) => `// @match        ${m}`).join("\n"))
    .replace("__STORE_JSON__", JSON.stringify({ name: s.name, searchPage: s.searchPage }))
    .replaceAll("__STORE_NAME__", s.name).replaceAll("__MODULE__", s.id)
    .replaceAll("__PANTARR_API__", o.api).replaceAll("__PANTARR_KEY__", o.key).replaceAll("__VERSION__", o.version);
}

export const storeCarts: CartConnector[] = STORES.map((s) => ({
  manifest: { id: s.id, kind: "cart", name: `${s.name} — cart`, countries: ["FR"], bridge: true, origins: s.origins, siteUrl: s.siteUrl,
    description: "Fills the online basket from your browser. The first time, the script learns how the site searches and adds a product (one search and one product added by hand); otherwise it opens the search of each item for you.",
    settings: {} },
  bridgeScript: (o: { api: string; key: string; version: string }) => storeScript(s, o),
}));
