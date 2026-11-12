// Developer build of the extension, unpacked, straight from the working copy (no CI, no deployment): only when
// EXTENSION_OUT is given — `EXTENSION_OUT=/path npx jest --selectProjects unit src/extension/dev-build`. Chrome loads
// that folder (« Load unpacked ») and only needs « Reload » after each new build.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { extensionFiles } from "./extension";

const out = process.env.EXTENSION_OUT;
(out ? it : it.skip)("writes the unpacked extension", () => {
  rmSync(out!, { recursive: true, force: true });
  for (const [name, data] of Object.entries(extensionFiles(process.env.EXTENSION_BASE || "https://pantarr.example.com"))) {
    mkdirSync(dirname(join(out!, name)), { recursive: true });
    writeFileSync(join(out!, name), data);
  }
});
