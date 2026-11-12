// Lidl Plus (every country with a Lidl website): the digital receipts of the user's Lidl account, read by the browser
// bridge (lidl.user.js) with the user's own session on the Lidl website, sent to the receipts inbox. No login stored
// in Pantarr; the Lidl website API is not public and may change.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConnectorManifest } from "@pantarr/connector-sdk";

const SITES = ["fr", "de", "co.uk", "ie", "es", "it", "be", "nl", "at", "ch", "pl", "pt", "cz", "sk", "hu", "ro", "bg", "hr", "si", "dk", "se", "fi", "gr", "lt", "lv", "ee", "rs", "cy", "mt", "lu"]
  .map((tld) => `https://www.lidl.${tld}`);

export const lidlPlus = {
  manifest: { id: "lidl-plus", kind: "purchases", name: "Lidl Plus — digital receipts", bridge: true, origins: SITES, siteUrl: "https://www.lidl.fr/",
    description: "Your Lidl Plus receipts go to the purchase history: a script in your browser reads them in your Lidl account when you visit the Lidl website.",
    settings: {} } as ConnectorManifest,
  bridgeScript({ api, key, version, household }: { api: string; key: string; version: string; household?: string }) {
    return readFileSync(join(__dirname, "lidl.user.js"), "utf8")
      .replace("// __MATCHES__", SITES.map((s) => `// @match        ${s}/*`).join("\n"))
      .replaceAll("__HOUSEHOLD__", /^[a-z0-9]+$/i.test(household ?? "") ? household! : "")
      .replaceAll("__PANTARR_API__", api).replaceAll("__PANTARR_KEY__", key).replaceAll("__VERSION__", version);
  },
};
