import { describe, expect, it } from "vitest";
import { browserName, issueUrl } from "./feedback";

const firefoxAndroid = "Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0";
const edge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";

describe("ticket links", () => {
  it("names the browser and the system only", () => {
    expect(browserName(firefoxAndroid)).toBe("Firefox 133, Android");
    expect(browserName(edge)).toBe("Edge 131, Windows");
    expect(browserName("curl/8")).toBe("");
  });
  it("prefills the bug form without the query string of the page", () => {
    const u = new URL(issueUrl("https://github.com/o/r", "bug", { version: "0.1.0", mode: "hosted", page: "/shopping?code=secret", userAgent: edge }));
    expect(u.pathname).toBe("/o/r/issues/new");
    expect(u.searchParams.get("template")).toBe("bug.yml");
    expect(u.searchParams.get("version")).toBe("0.1.0");
    expect(u.searchParams.get("mode")).toBe("hosted");
    expect(u.searchParams.get("page")).toBe("/shopping");
    expect(u.searchParams.get("browser")).toBe("Edge 131, Windows");
  });
  it("gives the feature form only the version and the instance", () => {
    const u = new URL(issueUrl("https://github.com/o/r", "feature", { version: "0.1.0", mode: "self-hosted", page: "/planning", userAgent: edge }));
    expect(u.searchParams.get("template")).toBe("feature.yml");
    expect(u.searchParams.has("page")).toBe(false);
    expect(u.searchParams.has("browser")).toBe(false);
  });
});
