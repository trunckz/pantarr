import { inflateRawSync } from "node:zlib";
import { crc32, extensionFiles, pageScript, zip } from "./extension";

describe("browser extension", () => {
  const files = extensionFiles("https://pantarr.example.com");
  const manifest = JSON.parse(files["manifest.json"].toString());

  it("runs the script of every store in its pages, given the configuration by the bridge", () => {
    expect(manifest.manifest_version).toBe(3);
    const ids = manifest.content_scripts.slice(1).map((c: { js: string[] }) => c.js[0]);
    expect(ids).toEqual(expect.arrayContaining(["stores/intermarche-cart.js", "stores/leclerc-cart.js", "stores/lidl-plus.js"]));
    expect(manifest.content_scripts[0]).toMatchObject({ js: ["bridge.js"], run_at: "document_start" });
    expect(manifest.content_scripts[1]).toMatchObject({ world: "MAIN" });
    expect(manifest.host_permissions).toContain("https://pantarr.example.com/*");
    expect(manifest.host_permissions).toContain("https://www.intermarche.com/*");
    for (const [name, data] of Object.entries(files).filter(([n]) => n.startsWith("stores/"))) {
      const js = data.toString();
      expect({ name, leftover: /@@PANTARR|PANTARRHOUSEHOLD|__PANTARR_|==UserScript==/.test(js) }).toEqual({ name, leftover: false });
      expect(js).toContain("__cfg");
      expect(() => new Function(js)).not.toThrow();   // valid JavaScript
    }
    expect(files["popup.js"].toString()).toContain('const DEFAULT_API = "https://pantarr.example.com"');
  });

  it("refuses a script using the configuration in an unknown way", () => {
    expect(() => pageScript('const x = "@@PANTARR_API@@" + "/y"; const k = "@@PANTARR_KEY@@";')).toThrow();
  });

  it("writes a valid zip archive", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    const z = zip({ "a.txt": Buffer.from("bonjour bonjour bonjour"), "dir/b.json": Buffer.from("{}") });
    expect(z.readUInt32LE(0)).toBe(0x04034b50);
    const nameLength = z.readUInt16LE(26), size = z.readUInt32LE(18);
    expect(z.subarray(30, 30 + nameLength).toString()).toBe("a.txt");
    expect(inflateRawSync(z.subarray(30 + nameLength, 30 + nameLength + size)).toString()).toBe("bonjour bonjour bonjour");
    expect(z.readUInt32LE(z.length - 22)).toBe(0x06054b50);
    expect(z.readUInt16LE(z.length - 12)).toBe(2);
  });
});

describe("archives of the browser stores", () => {
  const store = (target: "chrome" | "firefox") => {
    const files = extensionFiles("", target);
    return { files, manifest: JSON.parse(files["manifest.json"].toString()) };
  };
  it("talks to no instance by default and asks no access beyond the stores and recipe sites", () => {
    const { files, manifest } = store("chrome");
    expect(files["popup.js"].toString()).toContain('const DEFAULT_API = ""');
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.host_permissions.every((h: string) => h.startsWith("https://"))).toBe(true);
    expect(manifest.host_permissions).not.toContain("https://*/*");
    expect(manifest.permissions).toEqual(["storage"]);
  });
  it("gives each browser its own manifest, with icons of the right sizes", () => {
    const chrome = store("chrome").manifest, { files, manifest: firefox } = store("firefox");
    expect(chrome.browser_specific_settings).toBeUndefined();
    expect(firefox.browser_specific_settings.gecko).toMatchObject({ id: "extension@pantarr.app", data_collection_permissions: { required: ["websiteContent", "financialAndPaymentInfo"] } });
    for (const [size, file] of Object.entries(firefox.icons as Record<string, string>)) {
      expect(files[file].readUInt32BE(16)).toBe(Number(size));   // PNG width
    }
  });
});
