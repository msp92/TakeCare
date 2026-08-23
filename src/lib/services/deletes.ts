import type { SupabaseClient } from "@supabase/supabase-js";

import { buildReportSection } from "@/lib/services/reports";
import type { ExtractionPayload } from "@/types";

const BUCKET = "lab-pdfs";

export class UploadNotFoundError extends Error {
  constructor() {
    super("Upload not found");
    this.name = "UploadNotFoundError";
  }
}

export async function deleteUpload(supabase: SupabaseClient, userId: string, uploadId: string): Promise<void> {
  const { data: upload, error: fetchError } = await supabase
    .from("uploads")
    .select("id, storage_path")
    .eq("id", uploadId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string; storage_path: string }>();

  if (fetchError) {
    throw fetchError;
  }

  if (!upload) {
    throw new UploadNotFoundError();
  }

  const { error: deleteError } = await supabase.from("uploads").delete().eq("id", uploadId).eq("user_id", userId);

  if (deleteError) {
    throw deleteError;
  }

  const { error: storageError } = await supabase.storage.from(BUCKET).remove([upload.storage_path]);
  if (storageError) {
    console.warn(`Failed to remove storage object ${upload.storage_path}: ${storageError.message}`);
  }

  try {
    await rebuildReportFromExtractions(supabase, userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Report rebuild failed";
    console.warn(`Report rebuild failed after upload delete: ${message}`);
  }
}

export async function rebuildReportFromExtractions(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: extractions, error } = await supabase
    .from("extractions")
    .select("payload, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .overrideTypes<{ payload: ExtractionPayload; created_at: string }[], { merge: false }>();

  if (error) {
    throw error;
  }

  const content = buildReportFromExtractions(extractions);

  if (content.length === 0) {
    const { error: deleteError } = await supabase.from("reports").delete().eq("user_id", userId);
    if (deleteError) {
      throw deleteError;
    }
    return;
  }

  const { error: upsertError } = await supabase.from("reports").upsert({
    user_id: userId,
    content,
  });

  if (upsertError) {
    throw upsertError;
  }
}

export function buildReportFromExtractions(extractions: { payload: ExtractionPayload; created_at: string }[]): string {
  const sections = extractions
    .map((extraction) => buildReportSection(extraction.payload.items))
    .filter((section) => section.length > 0);

  return sections.join("\n\n");
}
