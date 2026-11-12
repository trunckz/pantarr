// Ingredients of the recipe editor as one text (one per line, « # Section » lines).

/** Ingredients ↔ text: one per line, a section starts with a « # Section » line. */
export function ingredientsText(list: { section?: string; text: string }[]): string {
  let section = "";
  const out: string[] = [];
  for (const i of list) {
    if ((i.section ?? "") !== section) { section = i.section ?? ""; if (section) out.push(`# ${section}`); }
    out.push(i.text);
  }
  return out.join("\n");
}
export function ingredientsOf(text: string): { section?: string; text: string }[] {
  let section = "";
  const out: { section?: string; text: string }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) { section = line.replace(/^#+\s*/, ""); continue; }
    out.push({ ...(section ? { section } : {}), text: line.replace(/^[-•*]\s+/, "") });
  }
  return out;
}
