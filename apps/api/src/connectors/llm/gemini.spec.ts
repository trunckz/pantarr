import type { ConnectorContext } from "@pantarr/connector-sdk";
import { geminiConnector } from "./gemini.connector";

describe("Gemini", () => {
  it("goes to the fallback models (the default ones when none is set) as soon as a model does not answer in time", async () => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      const model = String(url).match(/models\/([^:]+):/)![1];
      calls.push(model);
      if (model === "gemini-flash-latest") { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; throw e; }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }), { status: 200 });
    }) as typeof fetch;
    const ctx = { settings: { apiKey: "k", model: "gemini-flash-latest" }, locale: "fr", log: () => undefined, fetch: f } as ConnectorContext;
    const r = await geminiConnector.complete(ctx, { prompt: "menu" });
    expect(r).toMatchObject({ json: { ok: true }, usage: { model: "gemini-2.5-flash", inputTokens: 10, outputTokens: 5 } });
    expect(calls).toEqual(["gemini-flash-latest", "gemini-2.5-flash"]);
  });
});
