// Text of a receipt without any LLM: OCR of photos (Tesseract, WebAssembly, languages shipped with the image: nothing
// downloaded, nothing sent out), text layer of PDF invoices (pdf.js through unpdf). A scanned PDF (no text layer) gives
// an empty text: a photo of it can be sent instead.
import { dirname, join } from "node:path";

const LANGS: Record<string, string> = { fr: "fra", en: "eng" };
let worker: Promise<{ recognize: (img: Buffer) => Promise<{ data: { text: string } }> }> | null = null;
let workerLang = "";

/** One Tesseract worker kept for the process (it takes a few seconds to start), in the household's language (the
 * French model reads the digits and the English words of a receipt as well). */
async function tesseract(locale: string) {
  const lang = LANGS[locale] ?? "eng";
  if (!worker || workerLang !== lang) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createWorker } = require("tesseract.js") as typeof import("tesseract.js");
    const langPath = join(dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`)), "4.0.0_best_int");
    const old = worker;
    workerLang = lang;
    worker = createWorker(lang, 1, { langPath, cacheMethod: "none", gzip: true, logger: () => undefined, errorHandler: () => undefined }) as unknown as typeof worker;
    if (old) old.then((w) => (w as unknown as { terminate: () => Promise<void> }).terminate()).catch(() => undefined);
  }
  return worker!;
}

/** Text of a photo of a receipt. */
export async function ocrImage(data: Buffer, locale: string): Promise<string> {
  const w = await tesseract(locale);
  return (await w.recognize(data)).data.text ?? "";
}

/** Text layer of a PDF, line by line (empty for a scan). */
export async function pdfText(data: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getDocumentProxy } = require("unpdf") as { getDocumentProxy: (d: Uint8Array) => Promise<PdfDoc> };
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const pages: string[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 20); n++) {
    const items = (await (await pdf.getPage(n)).getTextContent()).items.filter((i) => typeof i.str === "string");
    // words on the same height make a line (from top to bottom, then left to right)
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const i of items) {
      const y = Math.round(i.transform[5] / 3), row = rows.get(y) ?? [];
      row.push({ x: i.transform[4], s: i.str }); rows.set(y, row);
    }
    pages.push([...rows.entries()].sort((a, b) => b[0] - a[0])
      .map(([, row]) => row.sort((a, b) => a.x - b.x).map((w) => w.s).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
  }
  return pages.join("\n");
}

interface PdfDoc { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str: string; transform: number[] }[] }> }> }
