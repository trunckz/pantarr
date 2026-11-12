// OpenAI-compatible chat completions (OpenAI, Mistral, Ollama, LM Studio, vLLM, OpenRouter…), JSON answer.
import type { ConnectorContext, LlmConnector } from "@pantarr/connector-sdk";
import { parseJsonAnswer, sleep } from "./json";

export const openaiConnector: LlmConnector = {
  manifest: {
    id: "openai", kind: "llm", scope: "instance", name: "OpenAI-compatible (OpenAI, Mistral, Ollama, LM Studio…)",
    settings: {
      baseUrl: { type: "url", title: "Base URL (…/v1)", required: true, default: "https://api.openai.com/v1" },
      apiKey: { type: "string", title: "API key (empty for a local model)", secret: true },
      model: { type: "string", title: "Model", required: true },
      jsonMode: { type: "boolean", title: "JSON mode (response_format)", default: true },
    },
  },

  async complete(ctx: ConnectorContext, { prompt, files }) {
    // Images as image_url, PDF as file (OpenAI ; other services may refuse files: the error says so)
    const content = files?.length ? [{ type: "text", text: prompt }, ...files.map((f) => f.mimeType.startsWith("image/")
      ? { type: "image_url", image_url: { url: `data:${f.mimeType};base64,${f.data}` } }
      : { type: "file", file: { filename: f.name ?? "document.pdf", file_data: `data:${f.mimeType};base64,${f.data}` } })] : prompt;
    const base = String(ctx.settings.baseUrl).replace(/\/$/, "");
    let last = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await ctx.fetch(`${base}/chat/completions`, {
        method: "POST", signal: AbortSignal.timeout(300000),
        headers: { "Content-Type": "application/json", ...(ctx.settings.apiKey ? { Authorization: `Bearer ${ctx.settings.apiKey}` } : {}) },
        body: JSON.stringify({ model: ctx.settings.model, messages: [{ role: "user", content }],
          ...(ctx.settings.jsonMode !== false ? { response_format: { type: "json_object" } } : {}) }),
      }).catch((e: Error) => { last = e.message; return null; });
      if (!r) { await sleep(3000); continue; }
      if ([429, 500, 502, 503].includes(r.status)) { last = String(r.status); await sleep(4000 * (attempt + 1)); continue; }
      if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const d = await r.json() as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string };
      return { json: parseJsonAnswer(d.choices?.[0]?.message?.content ?? ""),
               usage: { model: d.model ?? String(ctx.settings.model), inputTokens: d.usage?.prompt_tokens ?? 0, outputTokens: d.usage?.completion_tokens ?? 0 } };
    }
    throw new Error(`LLM unavailable (${last})`);
  },

  async test(ctx) {
    const base = String(ctx.settings.baseUrl).replace(/\/$/, "");
    const r = await ctx.fetch(`${base}/models`, { headers: ctx.settings.apiKey ? { Authorization: `Bearer ${ctx.settings.apiKey}` } : {}, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`LLM: ${r.status}`);
    return "ok";
  },
};
