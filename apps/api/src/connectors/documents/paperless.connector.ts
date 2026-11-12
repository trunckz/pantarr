// Paperless-ngx (documents, optional but recommended): the receipts and invoices already archived there feed the
// purchase history. REST API with a token (Paperless → profile → API token); filter by correspondent and date.
import type { ArchivedDocument, ConnectorContext, DocumentsConnector } from "@pantarr/connector-sdk";

async function get<T>(ctx: ConnectorContext, url: string): Promise<T> {
  const r = await ctx.fetch(url, { headers: { Authorization: `Token ${ctx.settings.token}`, Accept: "application/json" }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`Paperless ${r.status}`);
  return r.json() as Promise<T>;
}

export const paperlessConnector: DocumentsConnector & { test(ctx: ConnectorContext): Promise<string> } = {
  manifest: {
    id: "paperless", kind: "documents", name: "Paperless-ngx", scope: "instance",
    description: "Optional, recommended: the receipts and invoices archived in Paperless feed the purchase history (learning).",
    settings: { url: { type: "url", title: "Paperless URL", required: true }, token: { type: "string", title: "API token", secret: true, required: true } },
  },
  async purchaseDocuments(ctx, { stores, since }) {
    const base = String(ctx.settings.url).replace(/\/$/, "");
    const out: ArchivedDocument[] = [];
    for (const store of stores) {
      const q = new URLSearchParams({ correspondent__name__iexact: store, page_size: "100", ordering: "created" });
      if (since) q.set("created__date__gte", since);
      let next: string | null = `${base}/api/documents/?${q}`;
      while (next) {
        const page: { next: string | null; results: { id: number; title: string; created: string; content: string; original_file_name?: string }[] } = await get(ctx, next);
        out.push(...page.results.map((d) => ({ id: String(d.id), title: d.title, created: d.created, content: d.content ?? "", correspondent: store, filename: d.original_file_name })));
        next = page.next?.replace(/^http:\/\/[^/]+/, base.replace(/^(https?:\/\/[^/]+).*$/, "$1")) ?? null;
      }
    }
    return out;
  },
  async test(ctx) {
    const d = await get<{ count: number }>(ctx, `${String(ctx.settings.url).replace(/\/$/, "")}/api/documents/?page_size=1`);
    return `${d.count} documents`;
  },
};
