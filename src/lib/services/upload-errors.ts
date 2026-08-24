import { formatUnknownError } from "@/lib/utils";

const UPLOAD_ERROR_HINTS: { match: RegExp; message: string }[] = [
  {
    match: /complete_upload_processing|function .* does not exist/i,
    message:
      "Brakuje funkcji complete_upload_processing w bazie Supabase. Na projekcie chmurowym uruchom: npx supabase link && npx supabase db push",
  },
  {
    match: /row-level security|permission denied/i,
    message: "Błąd uprawnień (RLS). Wyloguj się i zaloguj ponownie. Jeśli problem wraca, sprawdź migracje Supabase.",
  },
  {
    match: /bucket not found|lab-pdfs/i,
    message: "Brak bucketa lab-pdfs w Supabase Storage. Uruchom migracje: npx supabase db push",
  },
  {
    match: /not authenticated/i,
    message: "Sesja wygasła. Zaloguj się ponownie i spróbuj jeszcze raz.",
  },
  {
    match: /Could not parse any lab results/i,
    message:
      "Nie udało się odczytać wyników badań z tekstu PDF. Sprawdź, czy plik pochodzi z Diagnostyki i ma zaznaczalny tekst.",
  },
];

/** Map Supabase/PostgREST payloads (plain objects) to a user-visible Polish message when possible. */
export function formatUploadError(err: unknown): string {
  const raw = formatUnknownError(err);

  for (const { match, message } of UPLOAD_ERROR_HINTS) {
    if (match.test(raw)) {
      return message;
    }
  }

  return raw;
}
