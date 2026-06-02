# First PDF to Report — Implementation Plan

## Overview

S-01 delivers the north-star user journey: a user signs in via Magic Link, uploads a
pre-anonymized lab PDF (≤ 2 pages), and receives a longitudinal Markdown report.

The original plan assumed every selectable-text PDF yields extractable Unicode. The
Phase 0/1 spike disproved this for Diagnostyka: its PDFs use a custom font encoding
without a ToUnicode CMap, so text extraction (and even viewer copy-paste) returns raw
glyph IDs. The reframe (`frame.md`, Frame Brief II) established the correct strategy: a
**two-tier client-side extraction pipeline**. Tier 1 is the existing byte-stream
extractor (works for ALAB, Enel Med, and most providers); Tier 2 is **local, in-browser
OCR** (Tesseract.js) that triggers only when Tier 1 returns garbled text (Diagnostyka).
OCR runs entirely on the device, so the privacy requirement ("these are my records, I
don't want to share them") holds. Because OCR can silently mis-read lab numbers, the
OCR path requires a **mandatory user review/edit step** before any value is persisted.

## Current State Analysis

- **F-01 data layer**: complete — `uploads`, `extractions`, `reports` tables; private
  `lab-pdfs` Storage bucket; per-user RLS; DELETE policies deferred to this change.
- **Extraction blocker** (HIGH confidence, `frame.md`): Diagnostyka PDFs have no
  recoverable Unicode in the byte stream. Confirmed across providers by the user:
  Diagnostyka copy-paste = garbled; ALAB and Enel Med copy-paste = readable.
- **Tier 1 already exists**: `src/components/upload/PdfExtractor.ts` extracts text
  client-side via `pdfjs-dist` (CDN worker + CMaps), sorts items by reading order, and
  gates output with `isReadableExtractedText()`, throwing `ExtractionError("GARBLED")`
  when output looks like glyph IDs. This is exactly the Tier-1 + router seam needed.
- **Dev probe exists**: `src/components/upload/PdfExtractProbe.tsx` +
  `src/pages/dev/pdf-extract.astro` (DEV-only) drive `extractPdfText` from a file input.
- **Auth**: `signInWithPassword` only; no Magic Link, no `/auth/callback`, no OTP handler.
- **App surface**: `dashboard.astro` (placeholder), auth pages only. No upload or report
  routes, no `src/types.ts`, no service layer.

### Key Discoveries:

- `src/components/upload/PdfExtractor.ts:106` — `extractPdfText(file)` is the Tier-1
  entry point; `:149-151` throws `ExtractionError("GARBLED", …)` — the natural seam to
  invoke the OCR fallback.
- `src/components/upload/PdfExtractor.ts:69` — `isReadableExtractedText(text)` is reused
  as the post-OCR quality gate (no new heuristic needed).
- `src/components/upload/PdfExtractor.ts:28-43` — `loadPdfJs()` already imports
  `pdfjs-dist` and configures the CDN worker; Tier-2 reuses the same loaded module for
  `page.render()` to a canvas (Tier 1 only used `getTextContent()` so far).
- Tesseract.js v5/v6 API (Context7 `/naptha/tesseract.js`):
  `createWorker('pol', 1, { workerPath, langPath, corePath })`; `worker.recognize(canvas)`
  → `{ data: { text, confidence, words } }`; `worker.terminate()`. Accepts a canvas
  element directly.
- `supabase/migrations/20260527100000_create_core_schema.sql` — `reports.user_id` is the
  PK (one report per user); each upload merges into it.
- `supabase/migrations/20260527100100_enable_rls_policies.sql` — DELETE policies missing
  on all three tables and on Storage objects.
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]`; must add upload route.

## Desired End State

After this plan is complete:

1. A signed-out user enters their email, receives a Magic Link, and lands on `/dashboard`
   authenticated.
2. On upload, the browser extracts text: Tier 1 (fast) for clean PDFs; on garbled output
   it transparently falls back to Tier 2 local OCR.
3. When OCR runs, the user is shown the extracted text/values and must confirm or correct
   them before the upload is saved. Clean (Tier-1) uploads skip review.
4. The dashboard shows the merged longitudinal report (escaped, in `<pre>`) and an upload
   history with status badges.
5. Uploading another PDF merges new results into the same report row.

> Parser scope: the deterministic report parser is **Diagnostyka-first**; ALAB / Enel Med
> are best-effort (a provider whose text doesn't fit the grammar lands `status: 'failed'`
> with a message rather than a wrong report). Tier-1 *extraction* still works for all three.

**Verification**: US-01 manual pass — Magic Link sign-in → upload an ALAB/Enel Med PDF
(no review) → report appears; upload a Diagnostyka PDF → OCR runs → review step → confirm
→ report appears; sign out + sign in → report persists.

## What We're NOT Doing

- **Server-side / Worker-side OCR or PDF rendering** — OCR runs only client-side
  (privacy + Cloudflare Workers CPU constraints). No `renderPageAsImage` on Workers.
- **Cloud OCR / external parsing services** — would break the "data never leaves device"
  guarantee. Redact-then-send-to-LLM parsing is explicitly deferred to a separate change
  (PRD defers anonymization/Presidio to post-MVP).
- **Tier-1a server-side CMap injection** — disproven for Diagnostyka; the server never
  does PDF text extraction. Extraction is fully client-side.
- **Auto-anonymization (Presidio)** — post-MVP.
- **Multiple facility templates** — single deterministic Diagnostyka/lab parser for v1;
  no runtime template detector.
- **Async processing queues / KV** — synchronous in-request server pipeline for ≤ 2 pages.
- **Full delete UX** — only a minimal delete action; RLS migration is included so the DB
  is ready.
- **OCR confidence auto-accept** — the OCR path always routes through human review; we do
  not rely on Tesseract confidence scores to silently accept values.

## Implementation Approach

Extraction is **client-side and two-tier**. The browser always tries Tier 1
(`pdfjs-dist` text extraction). If `extractPdfText` throws `GARBLED` (or `EMPTY`), the
browser renders each page to a canvas and runs Tesseract.js OCR (`pol`), then re-applies
the `isReadableExtractedText` gate. The result carries a `source: "text" | "ocr"` tag.
The upload form submits `file` + `extracted_text` + `source`; when `source === "ocr"`,
the user must review/edit the text before submission is allowed. The server stores the
PDF, parses the (already client-extracted) text deterministically, and merges the report.

Upload pipeline contract: `POST /api/upload` receives `multipart/form-data` with `file`
(PDF), `extracted_text` (string), and `source` (`"text" | "ocr"`). The Worker never calls
PDF.js or OCR — it stores, parses, and builds the report.

## Critical Implementation Details

- **OCR triggers on `GARBLED` and `EMPTY`, not on every upload.** Tier 1 stays the fast
  path. Only the fallback pays the multi-second OCR cost, and only the fallback forces
  review. This keeps ALAB/Enel Med frictionless.
- **Render scale matters for number accuracy.** Render PDF pages to canvas at ~2–3×
  device scale before OCR; lab values are small and low-DPI rasterization mis-reads
  digits. This is the single most important OCR-accuracy lever.
- **Tesseract assets load from CDN once, then cache.** The PDF/image bytes never leave the
  browser; only the static engine/worker/`pol.traineddata` files are fetched (jsDelivr +
  `tessdata.projectnaptha.com`) and cached in IndexedDB. Reuse a single worker across
  pages and `terminate()` when done.

## Phase 1: Two-Tier Extraction (Tier 1 + Local OCR Fallback)

### Overview

Turn the existing single-tier extractor into a two-tier pipeline: keep Tier-1 text
extraction; add a Tier-2 local OCR fallback that triggers on garbled/empty Tier-1 output.
Tag the result with its source so downstream code can require review for OCR output.

### Changes Required:

#### 1. Add Tesseract.js dependency

**File**: `package.json`

**Intent**: Add `tesseract.js` as a runtime dependency for client-side OCR.

**Contract**: `npm install tesseract.js`. Engine core + `pol` language data are loaded
from CDN at runtime (not bundled), consistent with how `PdfExtractor.ts` loads the pdfjs
worker/CMaps from CDN.

#### 2. Create the OCR fallback module

**File**: `src/components/upload/PdfOcr.ts`

**Intent**: A browser-only module that renders PDF pages to canvases and runs Tesseract.js
OCR with Polish, returning concatenated text. Isolated from React for testability and lazy
loading.

**Contract**: Exports `async function ocrPdf(file: File, onProgress?: (p: number) => void): Promise<string>`.
- Reuses `pdfjs-dist` (via the same loader pattern as `PdfExtractor.ts`) to get the
  document; enforces the same `numPages > 2` guard (throws `ExtractionError("TOO_MANY_PAGES")`).
- For each page: `page.render()` to an offscreen/Canvas at a ~2.5× viewport scale.
- Creates one Tesseract worker via `createWorker("pol", 1, { workerPath, langPath, corePath })`
  pointed at jsDelivr (`tesseract.js`, `tesseract.js-core`) + `tessdata.projectnaptha.com`,
  recognizes each canvas, concatenates page text with `\n\n`, and `terminate()`s the worker
  in a `finally`.
- Throws `ExtractionError("EMPTY", …)` if no text is produced. Does NOT itself gate on
  readability — the caller re-applies `isReadableExtractedText`.

#### 3. Add the two-tier orchestrator

**File**: `src/components/upload/PdfExtractor.ts`

**Intent**: Add a function that runs Tier 1, and on `GARBLED`/`EMPTY` falls back to Tier-2
OCR, re-gates the OCR text, and reports which tier produced the result.

**Contract**: Export `type ExtractionSource = "text" | "ocr";` and
`async function extractPdfTextTiered(file: File, onOcrProgress?: (p: number) => void): Promise<{ text: string; source: ExtractionSource }>`.
- Calls `extractPdfText(file)`; on success returns `{ text, source: "text" }`.
- Catches `ExtractionError` with code `GARBLED` or `EMPTY`, dynamically imports `PdfOcr`,
  runs `ocrPdf(file)`, applies `isReadableExtractedText` to the OCR text, and returns
  `{ text, source: "ocr" }`. If OCR text still fails the gate, rethrows
  `ExtractionError("GARBLED", …)`.
- Rethrows `TOO_LARGE` / `TOO_MANY_PAGES` immediately without OCR fallback.
- `PdfOcr` is imported with a dynamic `import()` so Tesseract is only loaded when the
  fallback is hit (keeps it off the clean path's bundle/critical path).

#### 4. Update the dev probe to exercise both tiers

**Files**: `src/components/upload/PdfExtractProbe.tsx`, `src/pages/dev/pdf-extract.astro`

**Intent**: Drive `extractPdfTextTiered` from the probe so the OCR fallback can be tested
on real Diagnostyka PDFs locally, and show which tier produced the result + OCR progress.

**Contract**: `PdfExtractProbe` calls `extractPdfTextTiered(file, setProgress)` instead of
`extractPdfText`; displays the `source` ("text" / "ocr"), an OCR progress indicator while
recognizing, the readable-heuristic result, and the first 500 chars. The page heading is
updated from "Phase 1b" to "Two-tier extraction".

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes on `PdfOcr.ts` and `PdfExtractor.ts`
- `npm run lint` passes on changed files
- `tesseract.js` resolves and the dev route builds without Workers-env errors in `npm run dev`

#### Manual Verification:

- On `/dev/pdf-extract`: an ALAB or Enel Med PDF returns `source: "text"`, readable = yes
- A Diagnostyka PDF returns `source: "ocr"`, readable = yes, with recognizable Polish lab
  text (test names, numeric values) in the preview
- OCR worker is terminated (no leaked workers across repeated uploads — check devtools)
- Document the confirmed Diagnostyka OCR result in `change.md` Notes before Phase 2

**Implementation Note**: After automated checks pass, pause for manual confirmation that
the Diagnostyka OCR path produces readable Polish text before proceeding to Phase 2.

---

## Phase 2: Magic Link Authentication

### Overview

Replace email/password auth with Supabase OTP (Magic Link): enter email → receive link →
land on dashboard. Remove password fields, signup page, and `signInWithPassword`.

### Changes Required:

#### 1. `POST /api/auth/signin.ts`

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Replace `signInWithPassword` with `signInWithOtp`; accept only `email`.

**Contract**: Calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })`
where `emailRedirectTo` is the absolute URL of `/auth/callback` (derived from the request
`origin`). On success redirect to `/auth/confirm-email`; on error redirect to
`/auth/signin?error=...`.

#### 2. New `GET /auth/callback.astro`

**File**: `src/pages/auth/callback.astro`

**Intent**: Handle the auth callback, establish a session, redirect to dashboard.

**Verify-first (≤10 min spike, do this before wiring the handler)**: With
`@supabase/ssr` (PKCE) the Magic Link routes through `/auth/v1/verify`; whether the
final redirect to `/auth/callback` carries `?code=` (→ `exchangeCodeForSession`) or a
`token_hash` (→ `verifyOtp`) is template/version dependent and is NOT yet confirmed for
this config. Send a Magic Link locally, open the Inbucket message, and inspect the link's
query params. Record the observed param + chosen handler in `change.md` Notes, then
implement the matching branch below.

**Contract**: Reads the callback query params (and optional `next`). Branch on what the
link actually delivers:
- `?code=` present → `supabase.auth.exchangeCodeForSession(code)`.
- `token_hash` + `type` present → `supabase.auth.verifyOtp({ token_hash, type })`
  (device-independent; does not depend on the PKCE verifier cookie).
On success redirect to `/dashboard` (or a safe same-origin `next`); on error redirect to
`/auth/signin?error=auth_callback_failed`.

**Note**: the PKCE `exchangeCodeForSession` path requires the code-verifier cookie set
during the server-side `signInWithOtp` request to be present on the callback request —
opening the link in a different browser/device will fail it. If cross-device open must
work, prefer the `token_hash` + `verifyOtp` branch (and set the email template to
`{{ .TokenHash }}`).

#### 3. `src/components/auth/SignInForm.tsx`

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Single email field + "Send Magic Link"; show inline "Check your inbox" success.

**Contract**: `onSubmit` POSTs `{ email }` to `/api/auth/signin`; on 2xx render inline
"Check your inbox" with the submitted email; on error show `serverError`. Remove password
field and `PasswordToggle`.

#### 4. `src/pages/auth/signin.astro`

**File**: `src/pages/auth/signin.astro`

**Intent**: Remove the "Sign up" link — Magic Link is the only entry path.

**Contract**: Remove the `<p>` block linking to `/auth/signup`.

#### 5. Remove signup flow

**Files**: `src/pages/auth/signup.astro`, `src/pages/api/auth/signup.ts`,
`src/components/auth/SignUpForm.tsx`

**Intent**: OTP creates users implicitly on first send; remove dead signup routes.

**Contract**: Delete all three files. `/auth/signup` returns 404 (no UI links to it).

#### 6. `src/pages/auth/confirm-email.astro`

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Repurpose as the "Magic Link sent" landing page; remove the dev auto-confirm branch.

**Contract**: Remove the `isAutoConfirmed` conditional; single "Check your email" content
block with Magic Link copy. Remove the `DEV` env import.

#### 7. `supabase/config.toml`

**File**: `supabase/config.toml`

**Intent**: Enable OTP locally; align site URL and redirect allow-list with `/auth/callback`.

**Contract**: Set `site_url = "http://localhost:4321"` (currently `127.0.0.1:3000`); add
`"http://localhost:4321/auth/callback"` to `additional_redirect_urls` (currently only
`https://127.0.0.1:3000`). Leave both `enable_signup` keys at `true` (top-level `[auth]`
line ~175 and `[auth.email]` line ~210 — no change needed; OTP creates users implicitly).
`[auth.email] enable_confirmations` is currently `false` (line ~215); leave it `false` —
it governs signup email confirmation and is not required for the OTP / Magic Link flow
(only set it `true` if a separate signup-confirmation requirement appears). Do not add a
`[auth.email.template.magic_link]` block (absent in this config version) unless Fix B of
the callback step (token_hash template override) is chosen. Production Supabase Dashboard
must also allow-list the production Workers callback URL.

#### 8. `src/middleware.ts`

**File**: `src/middleware.ts`

**Intent**: Add the upload route to `PROTECTED_ROUTES` before it exists.

**Contract**: Add `/upload` to `PROTECTED_ROUTES` (confirm exact path against Phase 4).

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes on all auth files
- `npm run lint` passes on changed auth files

#### Manual Verification:

- Local Supabase (`npx supabase start`): enter email → Inbucket (`127.0.0.1:54324`) shows
  Magic Link → click → land on `/dashboard`
- Protected route while signed out redirects to `/auth/signin`
- `/auth/signup` no longer linked; no password fields on any auth page

---

## Phase 3: Core Types and Services

### Overview

Define shared domain types and the service layer for Supabase I/O, deterministic lab text
parsing, and report building. Extraction is client-side, so services receive
`extracted_text` + `source` rather than doing extraction.

### Changes Required:

#### 1. `src/types.ts`

**File**: `src/types.ts`

**Intent**: TypeScript interfaces matching the F-01 schema plus the extraction source flag.

**Contract**: Export `Upload`, `Extraction`, `Report` mirroring the SQL columns;
`UploadStatus = 'pending' | 'processing' | 'succeeded' | 'failed'`;
`ExtractionSource = 'text' | 'ocr'`;
`LabItem` (`{ name: string; value: string; unit?: string; refRange?: string; date: string }`);
`ExtractionPayload` (`{ facility: string; source: ExtractionSource; items: LabItem[]; rawText: string }`).

#### 2. `src/lib/services/uploads.ts`

**File**: `src/lib/services/uploads.ts`

**Intent**: Orchestrate the upload: insert row, store PDF, parse client-supplied text,
build/merge report, update status.

**Contract**: Export
`async function processUpload(supabase, userId, file, extractedText: string, source: ExtractionSource)`.
- Insert `uploads` row `status: 'processing'`, `storage_path = {userId}/{uploadId}.pdf`.
- Upload PDF bytes to `lab-pdfs` at `storage_path`.
- `parseLabText(extractedText)` → items; upsert `extractions` with payload
  (`{ facility, source, items, rawText }`).
- `buildReport(...)`; upsert `reports`.
- Update `uploads.status` to `'succeeded'` / `'failed'`. Return `{ uploadId, reportContent }`.
- No PDF.js / OCR calls server-side.

#### 3. `src/lib/services/parser.ts`

**File**: `src/lib/services/parser.ts`

**Intent**: Deterministically parse flat lab text into `LabItem[]`. Returns partial results
rather than throwing.

**Contract**: Export `function parseLabText(text: string): LabItem[]`. Uses regex for
section headers and row format (name / value / unit / reference range). Returns `[]` if no
rows parse (caller treats empty as soft failure → `status: 'failed'`). Must tolerate the
extra whitespace/line-break differences between Tier-1 text and OCR text.

**Scope (Diagnostyka-first, others best-effort)**: v1 targets the **Diagnostyka** layout
(the crucial OCR case). ALAB / Enel Med text parse on a best-effort basis with the same
grammar; if a provider's text does not fit, `parseLabText` returns `[]` and the upload
lands `status: 'failed'` with a clear message rather than producing a wrong report. This
keeps the "single deterministic parser, no template detector" constraint while making the
non-Diagnostyka providers explicitly best-effort, not guaranteed. Pin the concrete row
grammar (the Diagnostyka name/value/unit/refRange shape) in the implementation.

#### 4. `src/lib/services/reports.ts`

**File**: `src/lib/services/reports.ts`

**Intent**: Build/merge the longitudinal Markdown report.

**Contract**: Export `async function buildReport(supabase, userId, newItems: LabItem[]): Promise<string>`.
Fetch current `reports.content` (may be empty); append a `## <date>` section with the items
as a Markdown table; return merged content. Caller does the upsert.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes on `src/types.ts` and `src/lib/services/`
- `npm run lint` passes

#### Manual Verification:

- `tsx` script: `parseLabText` on a **Diagnostyka OCR-text fixture** returns expected
  `LabItem[]` (primary target); and on at least one **clean-text fixture** (ALAB or Enel
  Med) either returns expected items or `[]` (best-effort — `[]` is acceptable and routes
  to `status: 'failed'`, not a wrong report). Capture both fixtures under `scripts/fixtures/`
- `buildReport` with mock items produces readable Markdown with a dated section

---

## Phase 4: Upload Pipeline + OCR Review Step

### Overview

Add the upload page, the upload form (running the two-tier extraction client-side), the
mandatory OCR review/edit step, and the API endpoint that delegates to `processUpload`.

### Changes Required:

#### 1. `src/pages/upload.astro`

**File**: `src/pages/upload.astro`

**Intent**: Protected upload page rendering the upload island; shows post-redirect status.

**Contract**: Server-rendered, protected (in `PROTECTED_ROUTES`). Passes `user` to the
island. Reads `?status=success|error&message=...` and shows a banner.

#### 2. `src/components/upload/UploadForm.tsx`

**File**: `src/components/upload/UploadForm.tsx`

**Intent**: Run `extractPdfTextTiered` client-side; on `source === "ocr"` show a mandatory
review/edit UI before allowing submission; submit `file` + `extracted_text` + `source`.

**Contract**: `client:load` island. Accepts a PDF via `<input type="file" accept=".pdf">`;
validates MIME client-side. On select, calls `extractPdfTextTiered(file, onProgress)`:
- `source === "text"`: enable submit directly (optionally show a collapsed preview).
- `source === "ocr"`: render the extracted text in an **editable textarea** with a notice
  ("Text was read by on-device OCR — please verify the values before saving") and a
  required "I've reviewed these results" confirmation; submit stays disabled until
  confirmed. The (possibly edited) text is what gets submitted.
Shows extraction/OCR progress and typed errors (wrong MIME, > 2 pages, `GARBLED` after
OCR). Submits `FormData` (`file`, `extracted_text`, `source`) to `POST /api/upload`. On
2xx redirect to `/dashboard?status=success`; on error show inline message.

#### 3. `src/pages/api/upload.ts`

**File**: `src/pages/api/upload.ts`

**Intent**: Thin route validating the multipart upload and delegating to `processUpload`.

**Contract**: `export const POST: APIRoute` + `export const prerender = false`.
**Auth guard first**: resolve `userId` from `context.locals.user`; if absent (or the
request-scoped `supabase` client is null) return **401** JSON `{ error }` — middleware's
`startsWith("/upload")` does NOT match `/api/upload`, so this endpoint must self-check.
Then Zod-validate: `file` present and `type === 'application/pdf'`; `extracted_text`
present and non-empty; `source` in `{'text','ocr'}`; file size ≤ 20 MB. Call
`processUpload(supabase, userId, file, extractedText, source)` with the request-scoped
`supabase` client so per-user RLS applies. Success → redirect `/dashboard?status=success`;
validation error → 400 JSON `{ error }`; processing error → 500 JSON `{ error }`.

#### 4. `src/middleware.ts`

**File**: `src/middleware.ts`

**Intent**: Confirm `/upload` is protected (added Phase 2; verify path matches the route).

**Contract**: `PROTECTED_ROUTES` includes `/upload`.

### Success Criteria:

#### Automated Verification:

- `npx astro build` succeeds with no type errors in the upload route
- `npm run lint` passes on upload files

#### Manual Verification:

- Upload an ALAB/Enel Med PDF → no review step → `uploads` row `succeeded`,
  `extractions.payload.source === 'text'`, `reports.content` has a dated section
- Upload a Diagnostyka PDF → OCR progress → editable review textarea + required
  confirmation → submit → `extractions.payload.source === 'ocr'`, report updated
- Submitting an OCR upload without confirming is blocked (submit disabled)
- Non-PDF rejected client-side; empty-parse PDF → `uploads.status: failed` + message

---

## Phase 5: Report Dashboard

### Overview

Display the user's merged report and upload history. Report content is rendered as escaped
text in `<pre>` (untrusted content).

### Changes Required:

#### 1. `src/pages/dashboard.astro`

**File**: `src/pages/dashboard.astro`

**Intent**: Fetch and display `reports.content` and recent `uploads`; CTA when empty.

**Contract**: Server-rendered. Query `reports` (by `user_id`) and `uploads` (by `user_id`,
`created_at desc`, limit 10); pass as props. Render report via `<pre>` using `textContent`,
never `innerHTML`/Markdown-as-HTML.

#### 2. `src/components/dashboard/ReportDisplay.tsx`

**File**: `src/components/dashboard/ReportDisplay.tsx`

**Intent**: Render report content in a `<pre>` block; empty state when no report.

**Contract**: Props `{ content: string | null }`. Renders `<pre>{content}</pre>` with
Tailwind styling; no `dangerouslySetInnerHTML`.

#### 3. `src/components/dashboard/UploadHistory.tsx`

**File**: `src/components/dashboard/UploadHistory.tsx`

**Intent**: List past uploads with filename, date, status badge.

**Contract**: Props `{ uploads: Upload[] }`. Status badges (`pending`/`processing` yellow,
`succeeded` green, `failed` red); filename from `original_filename` or fallback.

### Success Criteria:

#### Automated Verification:

- `npx astro build` succeeds
- `npx astro check` passes on dashboard + components
- `npm run lint` passes

#### Manual Verification:

- After an upload: dashboard shows `<pre>` report and the upload with a `succeeded` badge
- Report and history persist after sign-out + sign-in
- `<script>` in report content renders as escaped text, not executed

---

## Phase 6: DELETE RLS Migration

### Overview

Add DELETE policies on the three tables and Storage objects, matching existing per-user
RLS patterns.

### Changes Required:

#### 1. New migration `supabase/migrations/<timestamp>_delete_rls_policies.sql`

**File**: `supabase/migrations/<timestamp>_delete_rls_policies.sql`

**Intent**: Grant authenticated users DELETE on their own rows and Storage objects.

**Contract**: `uploads`, `extractions`, `reports`: `DELETE` where `auth.uid() = user_id`.
Storage `lab-pdfs`: `DELETE` where `auth.uid()::text = (storage.foldername(name))[1]`.
Pattern matches `20260527100100_enable_rls_policies.sql` and
`20260527100200_storage_lab_pdfs_bucket.sql`.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies all migrations cleanly
- `npx supabase db diff` shows no unexpected changes

#### Manual Verification:

- Owner can DELETE their `uploads` row; cross-user DELETE is blocked by RLS
- Owner can DELETE their Storage object; cross-user DELETE is blocked

---

## Testing Strategy

### Unit Tests:

No automated runner configured. Manual `tsx` equivalents:

- `parseLabText` on text fixtures (both a clean-text sample and an OCR-text sample) →
  assert item count and field values
- `buildReport` with mock `LabItem[]` → assert Markdown structure

### Integration Tests:

- Supabase Studio SQL against local DB to verify RLS after Phases 2/6
- Reuse `supabase/snippets/test-rls-user-a.sql` patterns

### Manual Testing Steps (E2E):

1. `npx supabase start`; `npm run dev`
2. `/auth/signin` → email → Inbucket → Magic Link → `/dashboard`
3. `/upload` an ALAB/Enel Med PDF → confirm no review step → report appears
4. `/upload` a Diagnostyka PDF → OCR runs → review/edit → confirm → report appears
5. Sign out → sign in → report + history persist
6. Upload a second PDF → report appends a new dated section
7. Crafted `<script>` in reviewed OCR text → dashboard shows it escaped in `<pre>`

## Performance Considerations

- Tier 1 (`extractText` + parse + Supabase I/O) is well within budget for ≤ 2-page PDFs.
- Tier 2 OCR is the heavy path: it runs **client-side** (off the Worker), ~1–3 s/page at
  2.5× scale, in a Web Worker so the UI stays responsive. Tesseract assets (~15 MB) load
  on first OCR use and cache in IndexedDB. **Implementation note:** `PdfOcr.ts` bundles the
  worker and non-SIMD LSTM core via Vite `?url` (not jsDelivr) because the SIMD build aborts
  with `DotProductSSE` in embedded Chromium; `pol` traineddata still loads from
  `tessdata.projectnaptha.com`.
- `tesseract.js` and the OCR module are dynamically imported only when the `GARBLED`/`EMPTY`
  fallback fires — no impact on the clean path's bundle or critical path.
- Consider lazy-loading the `UploadForm` island (`client:idle`/`client:visible`).

## Migration Notes

- No data migration (no production upload data at S-01 start).
- DELETE RLS (Phase 6) is additive — no existing policies changed.
- Magic Link removes signup; existing password-registered test users remain valid
  (`signInWithOtp` creates users implicitly on first use).

## References

- Frame brief: `context/changes/first-pdf-to-report/frame.md` (Brief II — two-tier reframe
  + provider copy-paste comparison)
- Research: `context/changes/first-pdf-to-report/research.md`
- Tier-1 extractor: `src/components/upload/PdfExtractor.ts:106` (`extractPdfText`),
  `:69` (`isReadableExtractedText`), `:149` (`GARBLED` seam)
- Tesseract.js API: Context7 `/naptha/tesseract.js` (`createWorker`, `recognize`)
- F-01 schema: `supabase/migrations/20260527100000_create_core_schema.sql`
- F-01 RLS: `supabase/migrations/20260527100100_enable_rls_policies.sql`
- Storage: `supabase/migrations/20260527100200_storage_lab_pdfs_bucket.sql`
- Auth middleware: `src/middleware.ts:4`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.
> Do not rename step titles.

### Phase 1: Two-Tier Extraction (Tier 1 + Local OCR Fallback)

#### Automated

- [x] 1.1 `npx astro check` passes on `PdfOcr.ts` and `PdfExtractor.ts` — dd627cd
- [x] 1.2 `npm run lint` passes on changed files — dd627cd
- [x] 1.3 `tesseract.js` resolves; dev route builds without Workers-env errors — dd627cd

#### Manual

- [x] 1.4 ALAB/Enel Med PDF → `source: "text"`, readable = yes — dd627cd
- [x] 1.5 Diagnostyka PDF → `source: "ocr"`, readable = yes, recognizable Polish lab text — dd627cd
- [x] 1.6 OCR worker terminated (no leaked workers across uploads) — dd627cd
- [x] 1.7 Confirmed Diagnostyka OCR result documented in `change.md` Notes — dd627cd

### Phase 2: Magic Link Authentication

#### Automated

- [x] 2.1 `npx astro check` passes on all auth files — d4283fc
- [x] 2.2 `npm run lint` passes on changed auth files — d4283fc

#### Manual

- [x] 2.3 Magic Link email in Inbucket; callback lands on `/dashboard` — d4283fc
- [x] 2.4 Protected routes redirect to `/auth/signin` when signed out — d4283fc
- [x] 2.5 No password fields visible on any auth page; `/auth/signup` not linked — d4283fc

### Phase 3: Core Types and Services

#### Automated

- [x] 3.1 `npx astro check` passes on `src/types.ts` and `src/lib/services/` — 915fbce
- [x] 3.2 `npm run lint` passes on service files — 915fbce

#### Manual

- [x] 3.3 `parseLabText` returns expected `LabItem[]` on Diagnostyka OCR-text fixture; clean-text fixture returns items or `[]` (best-effort) — 915fbce
- [x] 3.4 `buildReport` output is human-readable Markdown with a dated section — 915fbce

### Phase 4: Upload Pipeline + OCR Review Step

#### Automated

- [x] 4.1 `npx astro build` succeeds with no type errors in upload route — dddb8f0
- [x] 4.2 `npm run lint` passes on upload files — dddb8f0

#### Manual

- [x] 4.3 ALAB/Enel Med PDF → no review step → `uploads` `succeeded`, `payload.source === 'text'` — dddb8f0
- [x] 4.4 Diagnostyka PDF → OCR → editable review + required confirmation → `payload.source === 'ocr'` — dddb8f0
- [x] 4.5 OCR upload blocked until "reviewed" confirmation is checked — dddb8f0
- [x] 4.6 Non-PDF rejected client-side; empty-parse PDF → `uploads.status: failed` + message — dddb8f0

### Phase 5: Report Dashboard

#### Automated

- [x] 5.1 `npx astro build` succeeds — 23d818b
- [x] 5.2 `npx astro check` passes on dashboard and components — 23d818b
- [x] 5.3 `npm run lint` passes — 23d818b

#### Manual

- [x] 5.4 Dashboard shows `<pre>`-rendered report after a successful upload — 23d818b
- [x] 5.5 Upload history shows the file with a `succeeded` badge — 23d818b
- [x] 5.6 Report persists after sign-out + sign-in — 23d818b
- [x] 5.7 HTML injection in reviewed text renders as escaped text (not executed) — 23d818b

### Phase 6: DELETE RLS Migration

#### Automated

- [x] 6.1 `npx supabase db reset` applies cleanly — 4e34ce7
- [x] 6.2 `npx supabase db diff` shows no unexpected changes — 4e34ce7

#### Manual

- [x] 6.3 Owner can DELETE their `uploads` row; cross-user DELETE blocked — 4e34ce7
- [x] 6.4 Owner can DELETE their Storage object; cross-user DELETE blocked — 4e34ce7
