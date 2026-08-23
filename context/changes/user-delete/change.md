---
id: user-delete
title: "S-03: Usuwanie uploadów i raportu przez użytkownika"
status: impl_reviewed
roadmap_slice: S-03
prd_refs:
  - "§NFR: dane zdrowotne przechowywane wyłącznie w ramach aktywnego konta; użytkownik może usunąć uploady i raporty"
  - "§Access Control: flat role model — each user sees only own data"
created: 2026-08-23
updated: 2026-08-23
---

## Plan

Implementation plan: `context/changes/user-delete/plan.md`

## Cel

Zamknąć ostatnią lukę CRUD: użytkownik może **usunąć** wybrany upload (PDF
z bucketa `lab-pdfs` + wiersz `uploads` + powiązana `extractions`) oraz
wyczyścić lub usunąć cały raport ze swojego konta. Po operacji brak sierot w
Storage ani bazie.

## Kontekst i motywacja

Raport MVP-check (16.08.2026) wykazał, że TakeCare spełnia 4/5 minimalnych
kryteriów technicznych. Jedyną luką jest brak operacji Delete inicjowanej przez
użytkownika. PRD §NFR explicite wymaga, żeby użytkownik mógł usunąć uploady
i raporty.

Polityki RLS DELETE są już gotowe w migracji
`supabase/migrations/20260601100000_delete_rls_policies.sql`:
- `uploads_delete_own`
- `extractions_delete_own`
- `reports_delete_own`
- `lab_pdfs_delete_own`

Żaden nowy SQL nie jest wymagany — tylko endpoint aplikacyjny i UI.

## Zakres

### W zakresie (MVP)

- `DELETE /api/uploads/[id]` — usuwa wiersz `uploads` (FK cascade na
  `extractions`), obiekt PDF z bucketa `lab-pdfs`, następnie przebudowuje
  raport z pozostałych `extractions` lub kasuje go gdy brak uploadów.
- Przycisk „Usuń" przy każdym uploadu na `dashboard.astro` (komponent React,
  confirm dialog lub inline).
- Obsługa błędu partial failure (Storage nie usunął — zaloguj, nie blokuj UX).

### Poza zakresem

- Soft-delete / kosz — twarde usunięcie.
- Automatyczne przebudowanie raportu przez RPC (rebuild jest czysty TS po
  Delete uploadów).
- Usunięcie konta (poza `auth.users` cascade).

## Decyzje wstępne

| Temat | Decyzja |
|---|---|
| SQL migrations | Brak — polityki DELETE już istnieją |
| Kaskada na extractions | FK ON DELETE CASCADE — nie trzeba osobnego DELETE |
| Storage → DB kolejność | Najpierw DB, potem Storage; przy błędzie Storage loguj i zwróć sukces |
| Raport po usunięciu ostatniego uploadu | Reset `content` do `''` lub DELETE wiersza — do ustalenia w planie |
| UI | Przycisk przy każdym wierszu UploadHistory; brak osobnej strony |

## Następne kroki

1. `/10x-plan user-delete` — plan implementacji z fazami, API, UI i testami.
2. `/10x-implement user-delete` — wykonanie według planu.
