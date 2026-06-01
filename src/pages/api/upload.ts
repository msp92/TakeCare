import type { APIRoute } from "astro";
import { z } from "zod";

import { createClient } from "@/lib/supabase";
import { processUpload } from "@/lib/services/uploads";
import type { ExtractionSource } from "@/types";

export const prerender = false;

const MAX_FILE_BYTES = 20 * 1024 * 1024;

const sourceSchema = z.enum(["text", "ocr"]);

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

  if (typeof extractedText !== "string" || extractedText.trim().length === 0) {
    return new Response(JSON.stringify({ error: "extracted_text is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sourceResult = sourceSchema.safeParse(sourceEntry);
  if (!sourceResult.success) {
    return new Response(JSON.stringify({ error: "source must be text or ocr" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (fileEntry.type !== "application/pdf") {
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

  const source: ExtractionSource = sourceResult.data;

  try {
    await processUpload(supabase, user.id, fileEntry, extractedText.trim(), source);
    return context.redirect("/dashboard?status=success");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload processing failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
