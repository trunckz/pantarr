/** JSON answer of an LLM: parsed as is, or the first {...} block (some models add text or code fences around it). */
export function parseJsonAnswer(text: string): unknown {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error("the model did not answer in JSON");
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
