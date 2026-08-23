<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: First PDF to Report (two-tier OCR)

- **Plan**: `context/changes/first-pdf-to-report/plan.md`
- **Scope**: All 6 phases
- **Date**: 2026-06-02
- **Verdict**: APPROVED (post-triage)
- **Findings**: 0 critical | 5 warnings | 3 observations (all triaged 2026-06-02)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## What's solid (no action)

All planned files exist; no missing implementations; no critical security defects. XSS handled
(report rendered as text in `<pre>`, no `dangerouslySetInnerHTML`); `/api/upload` self-checks auth
(401 when no user); OCR is lazy-loaded only on Tier-1 failure; Tesseract worker + PDF doc terminated
in `finally`. `npx astro check` is clean (0 errors). Benign drifts not raised as findings:
SignInForm redirects to `/auth/confirm-email` (matches repurposed landing page); `extractions.insert`
vs `upsert` (each upload is a new row — insert is correct); `upload.astro` doesn't pass `user`
(API resolves it); parser uses line-based row matching without explicit section-header regex
(fine for Diagnostyka-first best-effort).

## Findings

### F1 — npm run lint fails (changed config + untracked debug debris)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: astro.config.mjs:56 + scripts/debug-pdf-parse.ts, extracted.txt
- **Detail**: Every phase's automated criteria claim "npm run lint passes," but `npm run lint` now reports 284 errors. One is in the committed, in-scope astro.config.mjs (prettier array-formatting at L56). The other ~283 are CRLF/`␍` errors in scripts/debug-pdf-parse.ts (untracked spike artifact, never in the plan) plus a stray extracted.txt. `npx astro check` is clean.
- **Fix**: Run `npm run lint:fix` (auto-fixes astro.config.mjs), then delete untracked spike artifacts scripts/debug-pdf-parse.ts and extracted.txt (or .gitignore them if intentionally local).
- **Decision**: FIXED — eslint --fix applied to astro.config.mjs (lints clean); deleted scripts/debug-pdf-parse.ts and extracted.txt.

### F2 — processUpload leaves orphaned rows/objects on partial failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/uploads.ts:76-88, 100-111
- **Detail**: Sequential writes (storage → extractions → reports → status). If buildReport/upsert fails, the upload is marked 'failed' but the extractions row + stored PDF persist (orphans). If the final 'succeeded' update fails after the report is written, the row is stuck 'processing' and the user sees a 500. markUploadFailed swallows its own Supabase error (`_message` unused, no error check).
- **Fix A ⭐ Recommended**: Wrap the multi-step write in a Postgres RPC / stored procedure so insert+report+status commit atomically.
  - Strength: Removes the orphan/stuck-state class; single round-trip respects RLS via request-scoped client.
  - Tradeoff: New migration + SQL function to maintain.
  - Confidence: MED — repo uses migrations heavily; RPC idiomatic.
  - Blind spot: Storage upload can't join the same tx — compensating delete still needed for the object.
- **Fix B**: Compensating cleanup in the catch path (delete extraction + storage object) and make the final status update best-effort (log on failure, don't 500 after the report is saved).
  - Strength: No schema change; localized to the service.
  - Tradeoff: Cleanup logic is itself fallible; more imperative branches.
  - Confidence: MED — straightforward but adds branches to test.
  - Blind spot: Cleanup failures still leave debris.
- **Decision**: FIXED via Fix A — `complete_upload_processing` RPC migration + `processUpload` calls RPC; compensating storage/extraction cleanup on failure; `markUploadFailed` checks errors.

### F3 — Concurrent report merge is read-modify-write (last-writer-wins)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/reports.ts:22-33 (+ caller upsert in uploads.ts)
- **Detail**: buildReport SELECTs reports.content, appends in JS, caller upserts the merged string. Two uploads racing (or a double-submit) both read the same base; the second upsert overwrites the first — a dated section is silently lost. End-state ("uploading another PDF merges into the same report") assumes durable appends.
- **Fix**: Move the merge into SQL — atomic `UPDATE reports SET content = content || $section WHERE user_id = $1` (or a Postgres RPC) instead of read-in-JS-then-upsert.
  - Strength: Eliminates the lost-update window; one statement.
  - Tradeoff: Markdown assembly moves into SQL (or an RPC wrapper).
  - Confidence: MED — tiny migration; logic is simple.
  - Blind spot: First-ever insert (no row yet) needs an upsert branch.
- **Decision**: FIXED — production merge is atomic in `complete_upload_processing` RPC; exported `mergeReportContent` for pure/test use; `buildReport` documented as non-production; verify-parser uses pure merge.

### F4 — /api/upload trusts client text with no size cap or CSRF

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/upload.ts:37-77
- **Detail**: Accepts arbitrary `extracted_text` + client-declared `source` with no max length (multi-MB string hits DB/JSON limits + parser CPU) and no CSRF token on a cookie-authenticated mutating POST. Auth guard itself is correct. Trusting client extraction is accepted plan scope; the unbounded length + CSRF gap are not.
- **Fix A ⭐ Recommended**: Add a zod max length on extracted_text (~1 MB, aligned with the 20 MB PDF cap) and reject oversize early.
  - Strength: Closes the cheap DoS vector; one schema line.
  - Tradeoff: Need a bound that fits 2-page lab text.
  - Confidence: HIGH — pure input validation, low risk.
  - Blind spot: CSRF still unaddressed (see Fix B).
- **Fix B**: Also add CSRF defense (SameSite=Strict cookies + custom header / double-submit token) for mutating routes.
  - Strength: Closes cross-site mutation regardless of cookie defaults.
  - Tradeoff: Touches auth/cookie layer; more to verify.
  - Confidence: MED — depends on current SameSite config in supabase.ts.
  - Blind spot: Haven't confirmed the session cookie's SameSite value.
- **Decision**: FIXED via Fix A — zod `uploadFieldsSchema` caps `extracted_text` at 1 MB.

### F5 — signin.ts API route missing `export const prerender = false`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/signin.ts:1-30
- **Detail**: Sibling API routes (api/upload.ts:8, auth/callback.ts:5) declare `export const prerender = false`, and CLAUDE.md requires it on API routes. signin.ts omits it. Works under full SSR but violates the stated convention.
- **Fix**: Add `export const prerender = false;` to signin.ts.
- **Decision**: FIXED — added `export const prerender = false`.

### F6 — Loose safe-next + unvalidated OTP type in auth callback

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth/handleAuthCallback.ts:5-9, 35-39
- **Detail**: resolveSafeNext blocks `//` but allows other same-origin-ish paths (no reject of `\`, encoded slashes, control chars). `type` from the query string is passed to verifyOtp without enum validation.
- **Fix**: Allowlist `next` to known paths (/dashboard, /upload) and zod-validate `type` against Supabase EmailOtpType before verifyOtp.
- **Decision**: FIXED — `resolveSafeNext` allowlists /dashboard and /upload; `emailOtpTypeSchema` gates verifyOtp.

### F7 — Tesseract assets bundled via ?url, not jsDelivr CDN (documented)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/upload/PdfOcr.ts:2-3,7,47-49
- **Detail**: Plan/Perf notes specified loading the Tesseract worker + core from jsDelivr. Implementation bundles worker/core via Vite `?url` and uses a non-SIMD LSTM core; only tessdata comes from CDN. Deliberate, documented fix (change.md: DotProductSSE abort in embedded Chromium) — justified deviation, flagged only to keep the plan claim and deviation reconciled.
- **Fix**: None required — optionally note the bundled-core decision in the plan's Performance section.
- **Decision**: FIXED — documented bundled worker/core + CDN tessdata in plan.md Performance Considerations.

### F8 — Server/client MIME validation parity (empty file.type)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/uploads.ts:26-28 vs PdfExtractor.ts:114-116
- **Detail**: Server rejects when `file.type !== "application/pdf"`; client tolerates an empty MIME. Some browsers send "" for .pdf files — the client extracts fine, then the server 400s after the work is done.
- **Fix**: Mirror the client rule server-side — reject only when type is set and not application/pdf.
- **Decision**: FIXED — `uploads.ts` and `api/upload.ts` reject only when MIME is set and not `application/pdf`.
