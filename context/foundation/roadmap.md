---
project: TakeCare
version: 1
status: draft
created: 2026-05-25
updated: 2026-08-23
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: TakeCare

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

TakeCare zamienia rozproszone PDF-y laboratoryjne w jeden longitudinalny raport Markdown gotowy do wizyty u specjalisty. Status quo traktuje wyniki jako jednorazowe artefakty uwięzione w portalach medycznych lub papierze; TakeCare agreguje je w trwały raport na koncie użytkownika, który przeżyje kolejne sesje i wizyty. Produkt nie zastępuje porady medycznej — dostarcza materiał do rozmowy z lekarzem.

## North star

**S-01: Prześlij pierwszy PDF → odbierz raport Markdown** — dostawa tego slice'a dla realnego PDF z obsługiwanej placówki potwierdza, że rdzeń produktu działa.

> "Gwiazda przewodnia" to najmniejszy end-to-end przepływ użytkownika, którego udana dostawa potwierdziłaby główną hipotezę PRD — tutaj: że ekstrakcja tekstu z PDF laboratoryjnego i agregacja w raport Markdown faktycznie działa dla danych z prawdziwej placówki. Sekwencjonowana jako pierwsza, bo wszystko inne ma wartość tylko jeśli to działa.

## At a glance

| ID   | Change ID              | Outcome (user can …)                                                                                     | Prerequisites | PRD refs                                      | Status   |
|------|------------------------|----------------------------------------------------------------------------------------------------------|---------------|-----------------------------------------------|----------|
| F-01 | `supabase-schema-rls`  | (foundation) tabele Supabase + RLS + bucket Storage gotowe; dane izolowane per konto                    | —             | §NFR, §Access Control                         | done     |
| S-01 | `first-pdf-to-report`  | zalogować się przez Magic Link, wgrać PDF i zobaczyć raport Markdown zapisany na koncie                 | F-01          | FR-001, FR-002, FR-003, FR-004, FR-006, US-01 | done     |
| S-02 | `report-refresh`       | wgrać kolejny PDF i zobaczyć zaktualizowany raport Markdown agregujący wszystkie wyniki                  | S-01          | FR-005                                        | proposed |
| S-03 | `user-delete`          | usunąć upload (PDF + ekstrakcja) oraz cały raport ze swojego konta                                       | S-01          | §NFR (dane zdrowotne), §Access Control        | proposed |

## Baseline

What's already in place in the codebase as of 2026-05-25 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 islands, shadcn/ui (`src/pages/`, `src/layouts/Layout.astro`)
- **Backend / API:** present — APIRoute handlers (`src/pages/api/auth/`), `src/middleware.ts` z ochroną tras i sesją Supabase
- **Data:** partial — klient Supabase skonfigurowany (`src/lib/supabase.ts`); brak migracji SQL, brak schematów tabel, brak zapytań aplikacyjnych
- **Auth:** partial — scaffold Supabase Auth obecny (middleware, signin/signup/signout endpoints, confirm-email page), ale implementacja używa `signInWithPassword` zamiast Magic Link wymaganego przez FR-001
- **Deploy / infra:** partial — Cloudflare Workers config (`wrangler.jsonc`), CI lint/build (`.github/workflows/ci.yml`); brak deploy w CI, brak Dockerfile
- **Observability:** partial — `observability.enabled` w `wrangler.jsonc`; brak SDK logowania, error trackingu, metryk

## Foundations

### F-01: Schemat Supabase + migracje + RLS

- **Outcome:** (foundation) Tabele Supabase dla uploadów, wyekstrahowanych wyników (JSON) i raportów Markdown stworzone z migracją SQL; polityki RLS izolują dane per konto użytkownika; bucket Supabase Storage dla plików PDF skonfigurowany i zabezpieczony.
- **Change ID:** `supabase-schema-rls`
- **PRD refs:** §NFR ("dane zdrowotne przechowywane wyłącznie w ramach aktywnego konta; użytkownik może usunąć uploady i raporty"), §Access Control (flat role model — each user sees only own data)
- **Unlocks:** S-01 (bez schematu nie można zapisać JSON ekstrakcji ani raportu Markdown), S-02 (report refresh operuje na tych samych tabelach)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sekwencjonowane pierwsze — bez schematu żaden slice nie ma gdzie zapisywać danych; proste do zaplanowania, nie wymaga decyzji produktowych. Kluczowe: RLS musi być skonfigurowane przed jakimkolwiek testem z prawdziwymi danymi zdrowotnymi.
- **Status:** done

## Slices

### S-01: Prześlij pierwszy PDF → odbierz raport Markdown

- **Outcome:** user can zalogować się przez Magic Link, wgrać preanonimizowany PDF z obsługiwanej placówki i zobaczyć wygenerowany raport Markdown zapisany na koncie (dostępny w kolejnej sesji)
- **Change ID:** `first-pdf-to-report`
- **PRD refs:** FR-001, FR-002, FR-003, FR-004, FR-006, US-01
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Decisions (2026-05-28, zaktualizowane):**
  - **Placówka v1:** wyłącznie PDF z **Diagnostyka** (jeden layout parsera). **Bez detektora szablonu w MVP** — zakładamy, że użytkownik wgrywa pliki z tego labu; odrzucamy tylko nie-PDF (MIME/typ pliku).
  - **Fixtures / walidacja:** właściciel dostarcza **dwa preanonimizowane PDF** z tego samego labu (Diagnostyka) do spike’a parsera i testów E2E; nie commitować do repo jeśli zawierają dane wrażliwe — trzymać lokalnie lub w `.gitignore`.
  - **PDF w MVP:** małe pliki, **max 2 strony**, już **redacted**; pozostały tekst **zaznaczalny** (nie skan) — `unpdf` wystarczy, przetwarzanie **synchroniczne** na Workers bez kolejki na start.
  - **Ekstrakcja tekstu (Workers):** **`unpdf`** (`extractText`); krótki spike na dostarczonych PDF w Phase 0 planu S-01.
  - **Anonimizacja:** poza MVP — użytkownik wgrywa **preanonimizowane** pliki. **Presidio** (auto-anonimizacja) — po MVP, osobny serwis; nie w S-01.
- **Unknowns:**
  - Magic Link — mitygacja dostarczalności emaili (resend UX, wybór providera) — Owner: user. Block: no. (PRD Open Q2 — monitorować po launch)
- **Risk:** Największe ryzyko to **parser layoutu Diagnostyka** (struktura wyników po `extractText`), nie biblioteka PDF ani rozmiar pliku. Auth: przełączenie `signInWithPassword` → `signInWithOtp`.
- **Status:** done

### S-03: Usuń upload lub raport

- **Outcome:** user can usunąć wybrany upload (PDF z bucketa + wiersz w `uploads` + powiązana `extractions`) oraz wyczyścić lub usunąć cały raport ze swojego konta; po usunięciu danych nie zostają żadne sieroty w Storage ani bazie
- **Change ID:** `user-delete`
- **PRD refs:** §NFR ("użytkownik może usunąć uploady i raporty"), §Access Control
- **Prerequisites:** S-01
- **Parallel with:** S-02 (niezależne ścieżki)
- **Blockers:** —
- **Decisions:**
  - Polityki RLS DELETE dla `uploads`, `extractions`, `reports` i bucketa `lab-pdfs` są już w migracji `20260601100000_delete_rls_policies.sql` — nie trzeba nowych migracji SQL.
  - Usunięcie uploadu: kaskadowe przez FK (`extractions` ON DELETE CASCADE) — wystarczy DELETE na `uploads`; Storage usuwa się jawnie w handlerze.
  - Raport jest rebuiltowany atomowo przez RPC; po usunięciu wszystkich uploadów raport można skasować lub zostawić pusty — decyzja implementacyjna (propozycja: reset `content` do `''`).
  - Brak soft-delete w MVP — twarde usunięcie.
- **Unknowns:** —
- **Risk:** Storage i baza muszą zostać zsynchronizowane; partial failure (baza OK, Storage nie) → sierota w Storage. Mitigacja: najpierw usuń wiersz DB, potem Storage; przy błędzie Storage zaloguj i zwróć sukces użytkownikowi (PDF jest sierotą bez rekordu — nie wycieknie przez RLS).
- **Status:** proposed

### S-02: Dodaj kolejny PDF → raport się aktualizuje

- **Outcome:** user can wgrać drugi (i kolejny) PDF i zobaczyć zaktualizowany raport Markdown agregujący wyniki ze wszystkich dotychczasowych uploadów
- **Change ID:** `report-refresh`
- **PRD refs:** FR-005
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sekwencjonowany po S-01 — logika ponownej generacji raportu jest rozszerzeniem S-01; główne ryzyko to poprawna agregacja (merge) wyników z wielu uploadów bez duplikatów badań.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID             | Suggested issue title                                          | Ready for `/10x-plan` | Notes                                                              |
|------------|-----------------------|----------------------------------------------------------------|-----------------------|--------------------------------------------------------------------|
| F-01       | `supabase-schema-rls` | Supabase schema, migrations & RLS for uploads/results/reports  | yes                   | Run `/10x-plan supabase-schema-rls`                                |
| S-01       | `first-pdf-to-report` | Magic Link login → PDF upload → Markdown report (north star)   | yes                   | Diagnostyka, `unpdf`, 2× sample PDF, bez detektora szablonu. `/10x-plan first-pdf-to-report` |
| S-02       | `report-refresh`      | Add PDF → update aggregated Markdown report                    | no                    | Zależy od S-01                                                     |
| S-03       | `user-delete`         | Delete upload (PDF + extraction) and/or full report            | yes                   | RLS DELETE policies already in DB; run `/10x-plan user-delete`     |

## Open Roadmap Questions

1. ~~**Który format PDF placówki jest obsługiwany w v1?**~~ **Resolved (2026-05-28):** tylko **Diagnostyka**.
2. ~~**Która biblioteka do parsowania PDF działa w Cloudflare Workers?**~~ **Resolved (2026-05-28):** **`unpdf`**; spike na 2 dostarczonych PDF Diagnostyka (≤2 strony, tekst zaznaczalny). Odrzucone na v1: `pdf-parse`, surowe `pdfjs-dist`, zewnętrzne API, kolejka async (niepotrzebna przy małych PDF).
3. **Magic Link — mitygacja dostarczalności emaili (resend UX, wybór providera email)** — Owner: user. Block: nie blokuje planowania; monitorować przy launch. Source: PRD Open Question 2.

## Parked

- **FR-007: Surowe zestawienie side-by-side powtarzających się badań** — Why parked: nice-to-have per PRD; parkowane zgodnie z celem `speed`. Kandydat do S-03 lub v2 razem z pełną analizą porównawczą.
- **Rich user profile** — Why parked: poza kontem auth; PRD §Non-Goals.
- **Non-PDF imports** — Why parked: tylko PDF w v1; PRD §Non-Goals.
- **Medical imaging (DICOM)** — Why parked: PRD §Non-Goals.
- **Automatic PDF anonymization (Presidio)** — Why parked: użytkownik dostarcza już redacted/preanonimizowane pliki w MVP; Presidio jako osobny serwis po MVP.
- **Facility template detector** — Why parked: MVP nie odrzuca „obcych” layoutów w runtime — tylko walidacja typu PDF; detekcja szablonu / multi-lab dopiero po MVP.
- **Multi-facility templates** — Why parked: jeden parser (Diagnostyka) w v1; PRD §Non-Goals.
- **Broad medical analysis / diagnoza kliniczna** — Why parked: PRD §Non-Goals i Guardrails.
- **Full comparative analysis** — Why parked: odroczone do v2; PRD §Non-Goals.
- **Caregiver / clinician access, admin portal** — Why parked: flat single-tenant model only; PRD §Non-Goals.

## Done

- **F-01: (foundation) Tabele Supabase dla uploadów, wyekstrahowanych wyników (JSON) i raportów Markdown stworzone z migracją SQL; polityki RLS izolują dane per konto użytkownika; bucket Supabase Storage dla plików PDF skonfigurowany i zabezpieczony.** — Archived 2026-06-02 → `context/archive/2026-05-27-supabase-schema-rls/`. Lesson: —.
- **S-01: user can zalogować się przez Magic Link, wgrać preanonimizowany PDF z obsługiwanej placówki i zobaczyć wygenerowany raport Markdown zapisany na koncie (dostępny w kolejnej sesji)** — Archived 2026-06-03 → `context/archive/2026-05-28-first-pdf-to-report/`. Lesson: —.
