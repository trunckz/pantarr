// Prices learned from the household's own purchases (receipts, invoices, online orders): what an article of the
// shopping list usually costs, and what the household spends. No price database of the stores: the household's
// receipts already say what it pays, in its own stores.
import { key } from "../common/text";

/** Words that say nothing about the product (quantities, units, small words, packaging). */
const NOISE = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "a", "au", "aux", "en", "et", "ou", "pour", "avec", "sans", "un", "une", "of", "the", "and",
  "with", "for", "g", "kg", "gr", "mg", "ml", "cl", "l", "x", "pc", "pcs", "piece", "pieces", "botte", "bottes", "sachet", "sachets", "boite", "boites", "pot", "pots",
  "paquet", "paquets", "barquette", "tranche", "tranches", "filet", "filets", "bouteille", "brique", "frais", "fraiche", "fraiches", "bio", "pack", "can", "bag",
  "bunch", "slice", "slices", "fresh", "environ", "about", "gros", "grosse", "petit", "petite", "petits", "petites"]);

/** Significant words of a text, first one first (« 2 courgettes bio » → ["courgettes"]). */
export function wordsOf(text: string): string[] {
  return key(text).split(" ").filter((w) => w.length >= 3 && !NOISE.has(w) && !/^\d/.test(w));
}

/** Does a word of a label stand for a word of the article? The same word (plural aside), or the label's word cut short
 * (« COURG » for « courgettes ») ; never a longer word (« laitière » is not « lait »). */
function sameWord(article: string, label: string): boolean {
  const a = article.replace(/[sx]$/, ""), l = label.replace(/[sx]$/, "");
  return a === l || (l.length >= 4 && a.startsWith(l)) || (l.startsWith(a) && l.length - a.length <= 2);
}

/** The words of the product's name: « BRAND - Name - details » → the name ; a receipt label as it is. */
function nameWords(label: string): string[] {
  const parts = label.split(/\s+-\s+/);
  return wordsOf(parts.length > 1 ? parts.slice(1).join(" ") : label);
}

export interface PricedProduct { label: string; price: number }

/** Typical price of each product: the median of its unit prices (promotions and errors weigh little). */
export function priceIndex(purchases: { label: string; unitPrice: number | null }[]): PricedProduct[] {
  const by = new Map<string, { label: string; prices: number[] }>();
  for (const p of purchases) {
    if (typeof p.unitPrice !== "number" || !(p.unitPrice > 0) || p.unitPrice > 500) continue;
    const k = key(p.label);
    const x = by.get(k) ?? { label: p.label, prices: [] };
    x.prices.push(p.unitPrice);
    by.set(k, x);
  }
  return [...by.values()].map((x) => ({ label: x.label, price: median(x.prices) }));
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
};

/** Price of an article from the products the household bought: those naming its first word (and most of the others).
 * « preferred »: the product chosen for this article (Water → Native), looked for first. */
export function priceOf(article: string, index: PricedProduct[], preferred?: string): { price: number; products: string[] } | null {
  for (const text of [preferred, article]) {
    if (!text) continue;
    const words = wordsOf(text);
    if (!words.length) continue;
    // the article's first word near the start of the product's name (« Pâtes coquillettes », not « Tarte … pâte
    // feuilletée ») ; an article of several words needs two of them (« liquide vaisselle » is not « lessive liquide »)
    const need = Math.min(2, words.length);
    let best = -Infinity;
    const found: { p: PricedProduct; score: number }[] = [];
    for (const p of index) {
      const name = nameWords(p.label);
      const at = name.findIndex((l) => sameWord(words[0], l));
      if (at < 0 || at > 2) continue;
      const matched = words.filter((w) => name.some((l) => sameWord(w, l))).length;
      if (matched < need) continue;
      const score = matched * 10 - at * 3 - Math.max(0, name.length - matched) * 0.5;
      if (score > best + 1e-9) { best = score; found.length = 0; }
      if (Math.abs(score - best) < 1e-9) found.push({ p, score });
    }
    if (found.length) return { price: round(median(found.map((x) => x.p.price))), products: found.slice(0, 3).map((x) => x.p.label) };
  }
  return null;
}

/** How many of the article are bought: « 3 courgettes », « 2 x lait » ; a weight or a volume is one product. */
export function countOf(text: string): number {
  const m = /^\s*(\d{1,2})\s*(?:x\s*)?([a-zàâçéèêëîïôûùüÿœ]+)/i.exec(text);
  if (!m || /^(g|gr|kg|mg|ml|cl|l|dl|cs|cc|tbsp|tsp|oz|lb)$/i.test(m[2])) return 1;
  return Math.min(6, Math.max(1, Number(m[1])));
}

export const round = (n: number) => Math.round(n * 100) / 100;

export interface ListEstimate {
  /** sum of the articles whose price is known */
  known: number;
  /** with the unknown ones counted at the household's median price */
  total: number;
  items: number;
  priced: number;
  lines: { text: string; price: number | null; products: string[] }[];
}

/** Cost of a list of articles (the shopping list not checked yet). */
export function estimateList(texts: string[], index: PricedProduct[], preferences: { article: string; product: string }[] = []): ListEstimate {
  const fallback = median(index.map((p) => p.price));
  const lines = texts.map((text) => {
    const pref = preferences.find((x) => key(text).includes(key(x.article)))?.product;
    const found = priceOf(text, index, pref);
    return { text, price: found ? round(found.price * countOf(text)) : null, products: found?.products ?? [] };
  });
  const known = round(lines.reduce((n, l) => n + (l.price ?? 0), 0));
  const unknown = lines.filter((l) => l.price === null).length;
  return { known, total: round(known + unknown * fallback), items: lines.length, priced: lines.length - unknown, lines };
}
