import type { AstroCookies } from "astro";

import { createClient } from "@/lib/supabase";

export function resolveSafeNext(nextParam: string | null): string {
  if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
    return nextParam;
  }
  return "/dashboard";
}

/**
 * Completes Magic Link / OTP callback and returns the redirect path (with query on error).
 */
export async function handleAuthCallback(
  params: {
    code: string | null;
    tokenHash: string | null;
    type: string | null;
    nextParam: string | null;
  },
  requestHeaders: Headers,
  cookies: AstroCookies,
): Promise<string> {
  const supabase = createClient(requestHeaders, cookies);
  if (!supabase) {
    return "/auth/signin?error=auth_callback_failed";
  }

  let authError: { message: string } | null = null;

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    authError = error;
  } else if (params.tokenHash && params.type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.tokenHash,
      type: params.type,
    });
    authError = error;
  } else {
    return "/auth/signin?error=auth_callback_failed";
  }

  if (authError) {
    return "/auth/signin?error=auth_callback_failed";
  }

  return resolveSafeNext(params.nextParam);
}
