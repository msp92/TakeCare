import type { Upload, UploadStatus } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  uploads: Upload[];
}

const STATUS_STYLES: Record<UploadStatus, string> = {
  pending: "bg-amber-500/20 text-amber-200",
  processing: "bg-amber-500/20 text-amber-200",
  succeeded: "bg-green-500/20 text-green-200",
  failed: "bg-red-500/20 text-red-200",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function UploadHistory({ uploads }: Props) {
  if (uploads.length === 0) {
    return <p className="text-sm text-blue-100/60">No uploads yet.</p>;
  }

  return (
    <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
      {uploads.map((upload) => (
        <li key={upload.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{upload.original_filename ?? "lab.pdf"}</p>
            <p className="text-xs text-blue-100/50">{formatDate(upload.created_at)}</p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize",
              STATUS_STYLES[upload.status],
            )}
          >
            {upload.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
