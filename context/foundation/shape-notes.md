---
project: TakeCare
context_type: greenfield
created: 2026-05-21
updated: 2026-05-21
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 7
  quality_check_status: accepted
  gray_areas_resolved:
    - topic: context_type
      decision: greenfield — no codebase markers in cwd
    - topic: pain_category
      decision: workflow friction + data trapped + missing capability
    - topic: insight
      decision: longitudinal view and visit context beat one-off PDF storage
    - topic: primary_persona_scope
      decision: individual managing own lab history (single-tenant MVP)
    - topic: auth_model
      decision: Magic Link (email, passwordless)
    - topic: role_separation
      decision: flat user model — each user sees only own data
    - topic: mvp_scope
      decision: defer full comparative analysis to v2; keep aggregation + report + refresh
    - topic: mvp_timeline
      decision: ~3 weeks after-hours with scoped MVP
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Śledzenie historii badań medycznych wymaga przeszukiwania wielu portali medycznych lub papierowych wersji w domu. Samodzielna analiza wyników często opiera się na przeglądaniu badań naukowych lub porad o różnej jakości w internecie. Wizyty u lekarzy bywają niespójne — pacjent może chcieć konsultacji u kilku specjalistów, ale na każdej wizycie grozi, że nie wie o co zapytać, zapomni zalecenia lekarza, a starszy kontekst z czasem zanika.

Wartość TakeCare leży w longitudinalnym widoku wyników i kontekście wizyt — nie w samym przechowywaniu plików PDF. Status quo traktuje wyniki jako jednorazowe artefakty; produkt agreguje je w raport użytkownika, który przetrwa kolejne sesje i wizyty.

Kategorie bólu (z discovery): tarcie workflow, dane uwięzione w portalach/PDF, brakująca zdolność do spójnej analizy w czasie.

## User & Persona

**Primary persona:** Osoba dorosła zarządzająca własną historią badań laboratoryjnych — świadomy zdrowia użytkownik lub pacjent z powtarzalnymi badaniami kontrolnymi. Nie opiekun ani lekarz w MVP.

**Kontekst:** Przed lub po wizycie u specjalisty; przy próbie porównania wyników tego samego badania w czasie; gdy szuka starszych wyników rozproszonych między portalami a papierem.

**Moment sięgnięcia po produkt:** Potrzebuje jednego miejsca z raportem Markdown agregującym badania i prostą analizą porównawczą — materiału do wizyty, nie zamiennika porady medycznej.

## Access Control

- **Wejście:** Magic Link na email — bez hasła w MVP.
- **Model ról:** Płaski — jeden typ użytkownika; każdy widzi wyłącznie własne pliki, JSON i raporty.
- **Poza zakresem MVP:** Profile użytkownika (poza kontem auth), udostępnianie opiekunowi/lekarzowi, panel administratora.

## Success Criteria

### Primary

End-to-end flow (v1, bez pełnej analizy porównawczej):

1. Użytkownik loguje się przez Magic Link.
2. Uploaduje preanonimizowany PDF z jednej placówki (obsługiwany format).
3. System ekstrahuje tekst i zapisuje JSON na storage użytkownika.
4. System generuje raport Markdown agregujący badania.
5. Raport zapisany na koncie — dostępny w kolejnej sesji.
6. Po dodaniu nowego PDF raport się aktualizuje.

Sukces = kroki 1–6 działają dla realnego PDF z obsługiwanej placówki.

### Secondary

- Przy powtarzających się nazwach badań — surowe zestawienie wartości obok siebie (bez silnika analizy porównawczej).

### Guardrails

- Dane użytkownika wyizolowane per konto — brak wycieku między tenantami.
- Tylko preanonimizowane PDF — brak automatycznej anonimizacji w MVP.
- Raporty są agregacją informacyjną — nie diagnozą ani poradą medyczną.
- Jeden format PDF / jedna placówka w v1 — bez szablonów innych placówek.

**Poza v1 (explicit defer):** Pełna analiza porównawcza tych samych badań w czasie → v2.

## Functional Requirements

### Authentication

- FR-001: User can sign in via Magic Link. Priority: must-have
  > Socrates: Counter-argument considered: email deliverability/spam may block first login. Resolution: kept; monitor onboarding funnel; consider resend UX and provider choice downstream.

### Import & extraction

- FR-002: User can upload a pre-anonymized PDF in the supported single-facility format. Priority: must-have
  > Socrates: No counter-argument; stands as written. Single-facility wedge accepted for MVP.
- FR-003: System can extract text from an uploaded PDF and persist structured JSON on the user's account storage. Priority: must-have
  > Socrates: No counter-argument; stands as written. JSON persistence kept for report regen and future comparison.

### Reports

- FR-004: User can view an aggregated Markdown report of their laboratory results. Priority: must-have
  > Socrates: No counter-argument; stands as written. Aggregation is the core v1 payoff even before full comparison.
- FR-005: System can update the Markdown report when the user adds a new PDF. Priority: must-have
  > Socrates: No counter-argument; stands as written.
- FR-006: User can access their saved Markdown report in a subsequent session. Priority: must-have
  > Socrates: No counter-argument; stands as written. Persistence is essential to longitudinal use case.
- FR-007: User can see raw side-by-side values when the same test name appears in multiple results. Priority: nice-to-have
  > Socrates: No counter-argument; stands as written. Lightweight bridge to v2 comparison.

## User Stories

### US-01: First PDF to persisted report

- **Given** a user with a valid Magic Link session and a pre-anonymized PDF from the supported facility
- **When** they upload the PDF and processing completes
- **Then** they see a Markdown report aggregating the extracted results, and the report is available on their next login

#### Acceptance Criteria

- Upload rejects non-PDF with a clear error (MVP: no facility template detector; Diagnostyka parser only)
- Extracted JSON is associated only with the uploading user's account
- Report renders without claiming medical diagnosis or treatment advice
- If processing fails, the user sees a failure state and no partial report is saved as success

## Business Logic

System zamienia rozproszone PDF-y laboratoryjne użytkownika w jeden longitudinalny raport Markdown gotowy do wizyty.

**Wejścia (user-facing):** Preanonimizowane PDF-y z obsługiwanej placówki dodane przez użytkownika.

**Wyjście:** Raport Markdown agregujący wyniki ze wszystkich uploadów użytkownika, aktualizowany po każdym nowym PDF.

**W produkcie:** Użytkownik widzi jeden raport zamiast przeszukiwać portale i papier; opcjonalnie surowe zestawienie powtarzających się nazw badań (nice-to-have). Pełna analiza porównawcza — reguła rozszerzona w v2.

## Non-Functional Requirements

- Dane zdrowotne przechowywane wyłącznie w ramach aktywnego konta; użytkownik może usunąć uploady i raporty (commitment obserwowalny z zewnątrz).

## Non-Goals

- **Rich user profile** — poza kontem auth; brak edycji profilu demograficznego w MVP.
- **Non-PDF imports** — tylko PDF w v1.
- **Medical imaging** — brak DICOM/obrazów klinicznych.
- **Automatic PDF anonymization** — użytkownik dostarcza już preanonimizowane pliki.
- **Multi-facility templates** — jeden format placówki w v1.
- **Broad medical analysis** — brak diagnozy, rekomendacji leczenia, silnika klinicznego.
- **Full comparative analysis** — odraczone do v2 (v1: opcjonalne surowe side-by-side).
- **Caregiver / clinician access, admin portal** — single-tenant flat model only.

## Quality cross-check

All required elements present. No gaps recorded.
