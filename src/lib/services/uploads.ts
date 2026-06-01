import type { SupabaseClient } from "@supabase/supabase-js";

import { parseLabText } from "@/lib/services/parser";
import { buildReport } from "@/lib/services/reports";
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

  if (file.type !== "application/pdf") {
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
    await markUploadFailed(supabase, uploadId, storageError.message);
    throw storageError;
  }

  const items = parseLabText(extractedText);
  if (items.length === 0) {
    await markUploadFailed(supabase, uploadId, "Could not parse any lab results from the extracted text");
    throw new Error("Could not parse any lab results from the extracted text");
  }

  const payload: ExtractionPayload = {
    facility: "diagnostyka",
    source,
    items,
    rawText: extractedText,
  };

  const { error: extractionError } = await supabase.from("extractions").insert({
    upload_id: uploadId,
    user_id: userId,
    payload,
  });

  if (extractionError) {
    await markUploadFailed(supabase, uploadId, extractionError.message);
    throw extractionError;
  }

  let reportContent: string;
  try {
    reportContent = await buildReport(supabase, userId, items);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Report build failed";
    await markUploadFailed(supabase, uploadId, message);
    throw err;
  }

  const { error: reportError } = await supabase.from("reports").upsert({
    user_id: userId,
    content: reportContent,
  });

  if (reportError) {
    await markUploadFailed(supabase, uploadId, reportError.message);
    throw reportError;
  }

  const { error: successError } = await supabase.from("uploads").update({ status: "succeeded" }).eq("id", uploadId);

  if (successError) {
    throw successError;
  }

  return { uploadId, reportContent };
}

async function markUploadFailed(supabase: SupabaseClient, uploadId: string, _message: string): Promise<void> {
  await supabase.from("uploads").update({ status: "failed" }).eq("id", uploadId);
}
