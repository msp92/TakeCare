import type { APIRoute } from "astro";
import { z } from "zod";

import { createClient } from "@/lib/supabase";
import { formatUploadError } from "@/lib/services/upload-errors";
import { processUpload } from "@/lib/services/uploads";
export const prerender = false;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 1024 * 1024;

const uploadFieldsSchema = z.object({
  extracted_text: z.string().min(1).max(MAX_EXTRACTED_TEXT_CHARS),
  source: z.enum(["text", "ocr"]),
});

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);

  if (!user || !supabase) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const form = await context.request.formData();
  const fileEntry = form.get("file");
  const extractedText = form.get("extracted_text");
  const sourceEntry = form.get("source");

  if (!(fileEntry instanceof File)) {
    return new Response(JSON.stringify({ error: "PDF file is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fieldsResult = uploadFieldsSchema.safeParse({
    extracted_text: typeof extractedText === "string" ? extractedText.trim() : "",
    source: sourceEntry,
  });

  if (!fieldsResult.success) {
    const extractedTextTooBig = fieldsResult.error.issues.some(
      (issue) => issue.path[0] === "extracted_text" && issue.code === "too_big",
    );
    const message = extractedTextTooBig
      ? `extracted_text must be at most ${String(MAX_EXTRACTED_TEXT_CHARS)} characters`
      : "extracted_text and source are required (source must be text or ocr)";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (fileEntry.type && fileEntry.type !== "application/pdf") {
    return new Response(JSON.stringify({ error: "File must be a PDF" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (fileEntry.size > MAX_FILE_BYTES) {
    return new Response(JSON.stringify({ error: "PDF must be at most 20 MB" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { extracted_text: validatedText, source } = fieldsResult.data;

  try {
    await processUpload(supabase, user.id, fileEntry, validatedText, source);
    return context.redirect("/dashboard?status=success");
  } catch (err) {
    console.warn("Upload processing failed:", err);
    const message = formatUploadError(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
