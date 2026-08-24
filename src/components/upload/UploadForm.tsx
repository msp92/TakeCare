import React, { useState } from "react";
import { FileUp } from "lucide-react";

import { extractPdfTextTiered, ExtractionError, type ExtractionSource } from "@/components/upload/PdfExtractor";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { cn, formatUnknownError } from "@/lib/utils";

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [source, setSource] = useState<ExtractionSource | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [status, setStatus] = useState<"idle" | "extracting" | "ready" | "error">("idle");
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const needsReview = source === "ocr";
  const textToSubmit = needsReview ? editedText : extractedText;
  const canSubmit =
    status === "ready" &&
    file !== null &&
    source !== null &&
    textToSubmit.trim().length > 0 &&
    (!needsReview || reviewConfirmed);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) {
      return;
    }

    if (selected.type && selected.type !== "application/pdf") {
      setStatus("error");
      setErrorMessage("Akceptowane są wyłącznie pliki PDF");
      setFile(null);
      return;
    }

    setFile(selected);
    setStatus("extracting");
    setErrorMessage("");
    setSource(null);
    setExtractedText("");
    setEditedText("");
    setReviewConfirmed(false);
    setOcrProgress(null);

    try {
      const result = await extractPdfTextTiered(selected, (percent) => {
        setOcrProgress(percent);
      });
      setExtractedText(result.text);
      setEditedText(result.text);
      setSource(result.source);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      if (err instanceof ExtractionError) {
        setErrorMessage(`${err.code}: ${err.message}`);
      } else {
        setErrorMessage(formatUnknownError(err));
      }
    } finally {
      setOcrProgress(null);
    }
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || !file || !source) {
      return;
    }

    setUploading(true);
    setErrorMessage("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("extracted_text", textToSubmit.trim());
    formData.append("source", source);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (response.redirected || response.ok) {
        window.location.assign(response.url || "/dashboard?status=success");
        return;
      }

      const body = (await response.json()) as { error?: string };
      setErrorMessage(body.error ?? "Nie udało się zapisać uploadu");
    } catch (err) {
      setErrorMessage(formatUnknownError(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <div>
        <label htmlFor="pdf-file" className="mb-1 block text-sm text-blue-100/80">
          PDF z badaniami (max 2 strony)
        </label>
        <input
          id="pdf-file"
          type="file"
          accept=".pdf,application/pdf"
          className="block w-full text-sm text-blue-100 file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-white"
          onChange={(e) => {
            void handleFileChange(e);
          }}
        />
      </div>

      {status === "extracting" && (
        <p className="text-sm text-blue-200">
          {ocrProgress !== null ? `Odczyt PDF (OCR)… ${String(ocrProgress)}%` : "Wyciąganie tekstu…"}
        </p>
      )}

      {status === "ready" && source && (
        <p className="text-sm text-blue-100/80">
          Ekstrakcja:{" "}
          <span className="font-medium text-purple-200">
            {source === "ocr" ? "OCR na urządzeniu" : "warstwa tekstowa"}
          </span>
        </p>
      )}

      {needsReview && status === "ready" && (
        <div className="space-y-3 rounded-lg border border-amber-400/30 bg-amber-950/20 p-4">
          <p className="text-sm text-amber-100">
            Tekst został odczytany przez OCR na urządzeniu — sprawdź wartości przed zapisaniem.
          </p>
          <textarea
            id="extracted_text"
            value={editedText}
            rows={12}
            className="w-full rounded-lg border border-white/20 bg-black/30 p-3 font-mono text-xs text-blue-50"
            onChange={(e) => {
              setEditedText(e.target.value);
            }}
          />
          <label className="flex items-start gap-2 text-sm text-blue-100/90">
            <input
              type="checkbox"
              checked={reviewConfirmed}
              className="mt-1"
              onChange={(e) => {
                setReviewConfirmed(e.target.checked);
              }}
            />
            Sprawdziłem/am te wyniki
          </label>
        </div>
      )}

      {!needsReview && status === "ready" && (
        <details className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-blue-100/80">
          <summary className="cursor-pointer text-purple-200">Podgląd wyciągniętego tekstu</summary>
          <pre className="mt-2 max-h-40 overflow-auto text-xs whitespace-pre-wrap">{extractedText.slice(0, 800)}</pre>
        </details>
      )}

      <ServerError message={errorMessage} />

      <Button
        type="submit"
        disabled={!canSubmit || uploading}
        className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
      >
        {uploading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Zapisywanie…
          </span>
        ) : (
          <span className={cn("flex items-center justify-center gap-2", !canSubmit && "opacity-50")}>
            <FileUp className="size-4" />
            Zapisz upload
          </span>
        )}
      </Button>
      {!canSubmit && status === "ready" && needsReview && !reviewConfirmed && (
        <p className="text-xs text-amber-200/80">Potwierdź weryfikację przed wysłaniem.</p>
      )}
    </form>
  );
}
