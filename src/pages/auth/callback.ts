import type { APIRoute } from "astro";

import { handleAuthCallback } from "@/lib/auth/handleAuthCallback";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const redirectTo = await handleAuthCallback(
    {
      code: context.url.searchParams.get("code"),
      tokenHash: context.url.searchParams.get("token_hash"),
      type: context.url.searchParams.get("type"),
      nextParam: context.url.searchParams.get("next"),
    },
    context.request.headers,
    context.cookies,
  );

  return context.redirect(redirectTo);
};
