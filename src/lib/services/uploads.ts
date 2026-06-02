import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { parseLabText } from "@/lib/services/parser";
import { buildReportSection } from "@/lib/services/reports";
import type { ExtractionPayload, ExtractionSource } from "@/types";

const BUCKET = "lab-pdfs";
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export interface ProcessUploadResult {
  uploadId: string;
  reportContent: string;
}

export async function processUpload(
  supabase: SupabaseClient,
  userId: string,
  file: File,
  extractedText: string,
  source: ExtractionSource,
): Promise<ProcessUploadResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("PDF must be at most 20 MB");
  }

  if (file.type && file.type !== "application/pdf") {
    throw new Error("File must be a PDF");
  }

  const uploadId = crypto.randomUUID();
  const storagePath = `${userId}/${uploadId}.pdf`;

  const { error: insertError } = await supabase.from("uploads").insert({
    id: uploadId,
    user_id: userId,
    storage_path: storagePath,
    original_filename: file.name,
    status: "processing",
    facility_template: "diagnostyka",
  });

  if (insertError) {
    throw insertError;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: storageError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });

  if (storageError) {
    await markUploadFailed(supabase, uploadId);
    throw storageError;
  }

  const items = parseLabText(extractedText);
  if (items.length === 0) {
    await cleanupUploadArtifacts(supabase, uploadId, storagePath);
    throw new Error("Could not parse any lab results from the extracted text");
  }

  const payload: ExtractionPayload = {
    facility: "diagnostyka",
    source,
    items,
    rawText: extractedText,
  };

  const reportSection = buildReportSection(items);
  const { data: reportContent, error: rpcError } = (await supabase.rpc("complete_upload_processing", {
    p_upload_id: uploadId,
    p_payload: payload,
    p_report_section: reportSection,
  })) as { data: string | null; error: PostgrestError | null };

  if (rpcError) {
    await cleanupUploadArtifacts(supabase, uploadId, storagePath);
    throw rpcError;
  }

  if (typeof reportContent !== "string") {
    await cleanupUploadArtifacts(supabase, uploadId, storagePath);
    throw new Error("Upload processing returned an unexpected response");
  }

  return { uploadId, reportContent };
}

async function markUploadFailed(supabase: SupabaseClient, uploadId: string): Promise<void> {
  const { error } = await supabase.from("uploads").update({ status: "failed" }).eq("id", uploadId);

  if (error) {
    throw new Error(`Failed to mark upload as failed: ${error.message}`);
  }
}

async function cleanupUploadArtifacts(supabase: SupabaseClient, uploadId: string, storagePath: string): Promise<void> {
  await supabase.from("extractions").delete().eq("upload_id", uploadId);
  await supabase.storage.from(BUCKET).remove([storagePath]);

  try {
    await markUploadFailed(supabase, uploadId);
  } catch {
    // Best-effort: storage/object cleanup already attempted; status may stay processing.
  }
}
