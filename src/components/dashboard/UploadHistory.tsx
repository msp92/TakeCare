import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Upload, UploadStatus } from "@/types";

interface Props {
  uploads: Upload[];
}

const STATUS_STYLES: Record<UploadStatus, string> = {
  pending: "bg-amber-500/20 text-amber-200",
  processing: "bg-amber-500/20 text-amber-200",
  succeeded: "bg-green-500/20 text-green-200",
  failed: "bg-red-500/20 text-red-200",
};

const STATUS_LABELS: Record<UploadStatus, string> = {
  pending: "Oczekuje",
  processing: "Przetwarzanie",
  succeeded: "Gotowe",
  failed: "Błąd",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pl-PL");
  } catch {
    return iso;
  }
}

export default function UploadHistory({ uploads }: Props) {
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(uploadId: string) {
    if (!window.confirm("Usunąć ten upload? Tej operacji nie można cofnąć.")) {
      return;
    }

    setError("");
    setDeletingId(uploadId);

    try {
      const response = await fetch(`/api/uploads/${uploadId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? "Nie udało się usunąć uploadu");
        return;
      }

      window.location.reload();
    } catch {
      setError("Błąd sieci — nie udało się usunąć uploadu");
    } finally {
      setDeletingId(null);
    }
  }

  if (uploads.length === 0) {
    return <p className="text-sm text-blue-100/60">Brak uploadów.</p>;
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>
      ) : null}
      <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
        {uploads.map((upload) => (
          <li key={upload.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{upload.original_filename ?? "lab.pdf"}</p>
              <p className="text-xs text-blue-100/50">{formatDate(upload.created_at)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLES[upload.status])}>
                {STATUS_LABELS[upload.status]}
              </span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deletingId === upload.id || upload.status === "processing" || upload.status === "pending"}
                onClick={() => {
                  void handleDelete(upload.id);
                }}
              >
                Usuń
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
