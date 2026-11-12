// Google Gemini (REST generateContent, JSON answer). Transient overload (429/500/503, frequent on the free tier):
// two new tries spaced out, then the fallback models (the default ones when none is set) ; no answer in time: the next
// model at once. Usage (tokens) from usageMetadata.
import type { ConnectorContext, LlmConnector } from "@pantarr/connector-sdk";
import { parseJsonAnswer, sleep } from "./json";

const URL = "https://generativelanguage.googleapis.com/v1beta/models";
export const GEMINI_FALLBACKS = "gemini-2.5-flash,gemini-flash-lite-latest";

export const geminiConnector: LlmConnector = {
  manifest: {
    id: "gemini", kind: "llm", scope: "instance", name: "Google Gemini",
    description: "The free tier lets Google use the prompts to improve its models: prefer the paid tier for a shared service.",
    settings: {
      apiKey: { type: "string", title: "API key", secret: true, required: true },
      model: { type: "string", title: "Model", default: "gemini-flash-latest" },
      fallbacks: { type: "string", title: "Fallback models (comma separated)", default: GEMINI_FALLBACKS },
      temperature: { type: "number", title: "Temperature", default: 0.8 },
    },
  },

  async complete(ctx: ConnectorContext, { prompt, files }) {
    const parts = [{ text: prompt }, ...(files ?? []).map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.data } }))];
    const models = [String(ctx.settings.model || "gemini-flash-latest"),
      ...String(ctx.settings.fallbacks ?? GEMINI_FALLBACKS).split(",").map((m) => m.trim()).filter(Boolean)];
    let last = "";
    for (const model of [...new Set(models)]) {
      for (let attempt = 0; attempt < 3; attempt++) {
        let r: Response;
        try {
          r = await ctx.fetch(`${URL}/${model}:generateContent?key=${encodeURIComponent(String(ctx.settings.apiKey))}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(180000),
            body: JSON.stringify({ contents: [{ role: "user", parts }],
              generationConfig: { responseMimeType: "application/json", temperature: Number(ctx.settings.temperature ?? 0.8) } }),
          });
        } catch (e) {
          last = `${model}: ${(e as Error).message}`;
          if ((e as Error).name === "TimeoutError" || /timeout/i.test((e as Error).message)) { ctx.log(`${last}, next model`); break; }   // overloaded: do not wait 3 minutes again
          await sleep(3000); continue;
        }
        if ([429, 500, 503].includes(r.status)) { last = `${model}: ${r.status}`; ctx.log(`${last}, retrying`); await sleep(4000 * (attempt + 1)); continue; }
        if (!r.ok) { last = `${model}: ${r.status} ${(await r.text()).slice(0, 200)}`; break; }
        const d = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } };
        const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        return { json: parseJsonAnswer(text), usage: { model, inputTokens: d.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: (d.usageMetadata?.candidatesTokenCount ?? 0) + (d.usageMetadata?.thoughtsTokenCount ?? 0) } };
      }
    }
    throw new Error(`Gemini unavailable (${last}), try again in a few minutes`);
  },

  async test(ctx) {
    const r = await ctx.fetch(`${URL}?key=${encodeURIComponent(String(ctx.settings.apiKey))}&pageSize=1`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Gemini: ${r.status}`);
    return "ok";
  },
};
