// Archives of the extension for the browser stores, from the sources (no instance, no database):
//   npm run extension:pack                       → dist/extension/pantarr-extension-<version>-{chrome,firefox}.zip
//   npm run extension:pack -- --base https://…   → same, talking by default to that Pantarr (a hosted service)
// Without --base, the user types the address of their Pantarr in the extension once (self-hosted and hosted alike).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { EXTENSION_VERSION, extensionFiles, zip } from "./extension";

export function pack(base: string, out: string): string[] {
  mkdirSync(out, { recursive: true });
  return (["chrome", "firefox"] as const).map((target) => {
    const file = join(out, `pantarr-extension-${EXTENSION_VERSION}-${target}.zip`);
    writeFileSync(file, zip(extensionFiles(base, target)));
    return file;
  });
}

if (require.main === module) {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] ?? "" : ""; };
  const base = arg("--base").replace(/\/+$/, "");
  if (base && !/^https:\/\/[^/]+$/.test(base)) throw new Error("--base: an https address without path, e.g. https://pantarr.example.com");
  for (const f of pack(base, resolve(arg("--out") || join(__dirname, "../../../../dist/extension")))) console.log(f);
}
