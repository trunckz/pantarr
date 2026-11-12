// Intermarché cart (France): the browser bridge userscript (cart.user.js), configured per user (Pantarr address,
// bridge API key). The site is protected against bots: the basket is filled from the user's own browser only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CartConnector } from "@pantarr/connector-sdk";

export const intermarcheCart: CartConnector = {
  manifest: {
    id: "intermarche-cart", kind: "cart", name: "Intermarché — cart", countries: ["FR"], bridge: true,
    description: "Fills the online basket from your browser (userscript, see My account → Browser bridge).",
    origins: ["https://www.intermarche.com"], siteUrl: "https://www.intermarche.com/",
    settings: {},
  },
  bridgeScript({ api, key, version }) {
    return readFileSync(join(__dirname, "cart.user.js"), "utf8")
      .replaceAll("__PANTARR_API__", api).replaceAll("__PANTARR_KEY__", key).replaceAll("__VERSION__", version);
  },
};
