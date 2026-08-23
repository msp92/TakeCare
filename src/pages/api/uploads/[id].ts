import type { APIRoute } from "astro";
import { z } from "zod";

import { deleteUpload } from "@/lib/services/deletes";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const uploadIdSchema = z.uuid();

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);

  if (!user || !supabase) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const idResult = uploadIdSchema.safeParse(context.params.id);
  if (!idResult.success) {
    return new Response(JSON.stringify({ error: "Upload id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await deleteUpload(supabase, user.id, idResult.data);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
