const AUTH_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed:
    "Nie udało się dokończyć logowania. Sprawdź, czy w Supabase → Authentication → URL Configuration masz dodany adres https://takecare.msp92.workers.dev/auth/callback.",
  "Supabase is not configured": "Supabase nie jest skonfigurowany na serwerze (brak SUPABASE_URL lub SUPABASE_KEY).",
};

export function formatAuthError(error: string | null): string | null {
  if (!error) {
    return null;
  }

  const decoded = decodeURIComponent(error);
  return AUTH_ERROR_MESSAGES[decoded] ?? decoded;
}
