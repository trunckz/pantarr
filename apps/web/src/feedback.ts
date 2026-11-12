// Links « Report a problem » / « Suggest an idea »: they open the issue forms of the project (.github/ISSUE_TEMPLATE)
// with the technical context already filled in (version, kind of instance, page, browser), never personal data.
export type IssueKind = "bug" | "feature";

export interface IssueContext { version?: string; mode?: string; page: string; userAgent: string }

/** Short browser and system name from the user agent (« Firefox 133, Android »), nothing that identifies the person. */
export function browserName(ua: string): string {
  const browser = /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}`
    : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`
    : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}`
    : /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+).*Safari/.exec(ua)![1]}` : "";
  const system = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, system].filter(Boolean).join(", ");
}

/** Address of a new prefilled ticket on the repository `base` (https://github.com/owner/repo). */
export function issueUrl(base: string, kind: IssueKind, ctx: IssueContext): string {
  const q = new URLSearchParams({ template: kind === "bug" ? "bug.yml" : "feature.yml" });
  if (ctx.version) q.set("version", ctx.version);
  if (ctx.mode) q.set("mode", ctx.mode);
  if (kind === "bug") {
    // the path only: ids in it (a recipe slug) are not personal, the query string could be
    q.set("page", ctx.page.split(/[?#]/)[0]);
    const b = browserName(ctx.userAgent);
    if (b) q.set("browser", b);
  }
  return `${base}/issues/new?${q.toString()}`;
}
