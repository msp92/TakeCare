import type { PDFDocumentProxy } from "pdfjs-dist";
import { createWorker } from "tesseract.js";
import tesseractCoreLstmUrl from "tesseract.js-core/tesseract-core-lstm.wasm.js?url";
import tesseractWorkerUrl from "tesseract.js/dist/worker.min.js?url";

import { ExtractionError, openPdfDocument } from "@/components/upload/PdfExtractor";

const LANG_PATH = "https://tessdata.projectnaptha.com/4.0.0_best";

/**
 * Non-SIMD LSTM core — avoids DotProductSSE aborts in browsers that pick SIMD but lack SSE
 * (e.g. some embedded Chromium builds). Slower than SIMD but reliable for ≤2-page lab PDFs.
 */
const TESSERACT_CORE_PATH = tesseractCoreLstmUrl;

/** Higher scale improves digit accuracy on small lab values. */
const RENDER_SCALE = 2.5;

async function renderPageToCanvas(doc: PDFDocumentProxy, pageNum: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) {
    throw new Error("Could not create canvas 2D context for OCR");
  }

  await page.render({ canvasContext, canvas, viewport }).promise;
  return canvas;
}

/**
 * Render each PDF page to a canvas and run Tesseract.js OCR (Polish).
 * Caller applies `isReadableExtractedText` — this module only produces raw OCR text.
 */
export async function ocrPdf(file: File, onProgress?: (percent: number) => void): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("ocrPdf must run in the browser");
  }

  const doc = await openPdfDocument(file);

  try {
    const worker = await createWorker("pol", 1, {
      workerPath: tesseractWorkerUrl,
      corePath: TESSERACT_CORE_PATH,
      langPath: LANG_PATH,
      workerBlobURL: false,
    });

    try {
      const pageTexts: string[] = [];
      const totalPages = doc.numPages;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const canvas = await renderPageToCanvas(doc, pageNum);
        const { data } = await worker.recognize(canvas);
        pageTexts.push(data.text);
        onProgress?.(Math.round((pageNum / totalPages) * 100));
      }

      const text = pageTexts.join("\n\n").trim();
      if (text.length === 0) {
        throw new ExtractionError("EMPTY", "OCR produced no text from the PDF");
      }

      return text;
    } finally {
      await worker.terminate();
    }
  } finally {
    await doc.destroy();
  }
}
