import React, { useState } from "react";

import {
  extractPdfTextTiered,
  ExtractionError,
  isReadableExtractedText,
  type ExtractionSource,
} from "@/components/upload/PdfExtractor";
import { formatUnknownError } from "@/lib/utils";

export default function PdfExtractProbe() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [preview, setPreview] = useState("");
  const [readable, setReadable] = useState<boolean | null>(null);
  const [source, setSource] = useState<ExtractionSource | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetail, setErrorDetail] = useState("");

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setStatus("loading");
    setPreview("");
    setReadable(null);
    setSource(null);
    setOcrProgress(null);
    setErrorMessage("");
    setErrorDetail("");

    try {
      const result = await extractPdfTextTiered(file, (percent) => {
        setOcrProgress(percent);
      });
      setPreview(result.text.slice(0, 500));
      setReadable(isReadableExtractedText(result.text));
      setSource(result.source);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      if (err instanceof ExtractionError) {
        setErrorMessage(`${err.code}: ${err.message}`);
      } else {
        setErrorMessage(formatUnknownError(err));
      }
      if (import.meta.env.DEV && err instanceof Error && err.stack) {
        setErrorDetail(err.stack);
      }
    } finally {
      setOcrProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 text-white">
      <p className="text-sm text-blue-100/70">
        Dev-only probe for two-tier extraction. Choose a lab PDF; the first 500 characters appear below.
      </p>
      <input
        type="file"
        accept=".pdf,application/pdf"
        onChange={(e) => {
          void handleFileChange(e);
        }}
        className="block w-full text-sm text-blue-100 file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-white"
      />
      {status === "loading" && (
        <p className="text-sm text-blue-200">
          {ocrProgress !== null ? `OCR in progress… ${String(ocrProgress)}%` : "Extracting text…"}
        </p>
      )}
      {status === "error" && (
        <div className="rounded-lg border border-red-400/40 bg-red-950/40 p-3 text-sm text-red-200">
          <p>{errorMessage}</p>
          {errorDetail ? (
            <pre className="mt-2 max-h-40 overflow-auto text-xs whitespace-pre-wrap text-red-300/80">{errorDetail}</pre>
          ) : null}
        </div>
      )}
      {status === "done" && (
        <>
          <p className="text-sm">
            Source:{" "}
            <span className="font-semibold text-blue-200">{source === "ocr" ? "ocr (Tier 2)" : "text (Tier 1)"}</span>
          </p>
          <p className="text-sm">
            Readable heuristic:{" "}
            <span className={readable ? "font-semibold text-green-300" : "font-semibold text-amber-300"}>
              {readable ? "yes" : "no"}
            </span>
          </p>
          <pre className="max-h-96 overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 text-left text-xs whitespace-pre-wrap text-blue-50">
            {preview}
          </pre>
        </>
      )}
    </div>
  );
}
