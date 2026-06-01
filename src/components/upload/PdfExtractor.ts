import { polyfillDomMatrix, polyfillMapGetOrInsertComputed, polyfillPromiseWithResolvers } from "@/lib/pdfjs-polyfills";
import { formatUnknownError } from "@/lib/utils";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api.js";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

const PDFJS_VERSION = "5.6.205";
const CMAP_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/cmaps/`;

/** Max upload size aligned with Phase 4 API (20 MB). */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type ExtractionErrorCode = "GARBLED" | "EMPTY" | "TOO_LARGE" | "TOO_MANY_PAGES";

export class ExtractionError extends Error {
  readonly code: ExtractionErrorCode;

  constructor(code: ExtractionErrorCode, message: string) {
    super(message);
    this.name = "ExtractionError";
    this.code = code;
  }
}

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsModule: PdfJsModule | null = null;
let workerConfigured = false;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (typeof window === "undefined") {
    throw new Error("extractPdfText must run in the browser");
  }

  polyfillPromiseWithResolvers();
  polyfillMapGetOrInsertComputed();
  polyfillDomMatrix();

  pdfJsModule ??= await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (!workerConfigured) {
    pdfJsModule.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    workerConfigured = true;
  }

  return pdfJsModule;
}

function isTextItem(item: TextItem | { type: string }): item is TextItem {
  return "str" in item;
}

function itemTransform(item: TextItem): number[] {
  return item.transform as number[];
}

function transformAt(transform: number[], index: number): number {
  return transform[index] ?? 0;
}

function sortPageItems(items: TextItem[]): TextItem[] {
  return [...items].sort((a, b) => {
    const yA = transformAt(itemTransform(a), 5);
    const yB = transformAt(itemTransform(b), 5);
    if (Math.abs(yB - yA) > 2) {
      return yB - yA;
    }
    return transformAt(itemTransform(a), 4) - transformAt(itemTransform(b), 4);
  });
}

/** Heuristic: readable Polish/Latin lab text vs raw glyph IDs. */
export function isReadableExtractedText(text: string): boolean {
  const sample = text.slice(0, 4000);
  if (sample.trim().length < 20) {
    return false;
  }

  const letters = sample.match(/[A-Za-zÀ-žąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g);
  const letterRatio = (letters?.length ?? 0) / sample.length;
  if (letterRatio < 0.15) {
    return false;
  }

  let controlCount = 0;
  for (const char of sample) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f) {
      controlCount += 1;
    }
  }
  if (controlCount > sample.length * 0.05) {
    return false;
  }

  const polishHints =
    /\b(wynik|badan|diagnost|hemoglobin|leukoc|glukoz|cholesterol|morfolog|referenc|jednostk|norma)\b/i;
  const latinWords = sample.match(/\b[A-Za-zÀ-žĄĆĘŁŃÓŚŹŻ]{3,}\b/g);
  if (polishHints.test(sample)) {
    return true;
  }

  return (latinWords?.length ?? 0) >= 5;
}

/** Opens a PDF for client-side processing; caller must call `doc.destroy()`. */
export async function openPdfDocument(file: File): Promise<PDFDocumentProxy> {
  const { getDocument } = await loadPdfJs();

  if (file.size > MAX_FILE_BYTES) {
    throw new ExtractionError("TOO_LARGE", `PDF must be at most ${String(MAX_FILE_BYTES / (1024 * 1024))} MB`);
  }

  if (file.type && file.type !== "application/pdf") {
    throw new ExtractionError("EMPTY", "File must be a PDF");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const loadingTask = getDocument({
    data: bytes,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    isEvalSupported: false,
  });

  const doc = await loadingTask.promise;

  if (doc.numPages > 2) {
    await doc.destroy();
    throw new ExtractionError("TOO_MANY_PAGES", "PDF must be at most 2 pages");
  }

  return doc;
}

/**
 * Extract text from a PDF in the browser using pdfjs-dist with CMap support.
 * Tier 1 — fast path for PDFs with readable Unicode in the byte stream.
 */
export async function extractPdfText(file: File): Promise<string> {
  const doc = await openPdfDocument(file);

  try {
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const items = content.items.filter(isTextItem);
      const sorted = sortPageItems(items);
      pageTexts.push(sorted.map((item) => item.str).join(" "));
    }

    const text = pageTexts.join("\n\n").trim();

    if (text.length === 0) {
      throw new ExtractionError("EMPTY", "No text could be extracted from the PDF");
    }

    if (!isReadableExtractedText(text)) {
      throw new ExtractionError("GARBLED", "Extracted text looks garbled — this PDF may not expose readable Unicode");
    }

    return text;
  } finally {
    await doc.destroy();
  }
}

export type ExtractionSource = "text" | "ocr";

/**
 * Tier 1 text extraction; on garbled/empty output, falls back to local OCR (Tier 2).
 */
export async function extractPdfTextTiered(
  file: File,
  onOcrProgress?: (percent: number) => void,
): Promise<{ text: string; source: ExtractionSource }> {
  try {
    const text = await extractPdfText(file);
    return { text, source: "text" };
  } catch (err) {
    if (!(err instanceof ExtractionError)) {
      throw new Error(`PDF extraction failed: ${formatUnknownError(err)}`);
    }

    if (err.code === "TOO_LARGE" || err.code === "TOO_MANY_PAGES") {
      throw err;
    }

    let ocrText: string;
    try {
      const { ocrPdf } = await import("@/components/upload/PdfOcr");
      ocrText = await ocrPdf(file, onOcrProgress);
    } catch (ocrErr) {
      if (ocrErr instanceof ExtractionError) {
        throw ocrErr;
      }
      throw new Error(`OCR failed: ${formatUnknownError(ocrErr)}`);
    }

    if (!isReadableExtractedText(ocrText)) {
      throw new ExtractionError(
        "GARBLED",
        "OCR text still looks garbled — please verify the PDF or try another export",
      );
    }

    return { text: ocrText, source: "ocr" };
  }
}
