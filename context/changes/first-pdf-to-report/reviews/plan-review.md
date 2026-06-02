<!-- PLAN-REVIEW-REPORT -->
# Plan Review: First PDF to Report (two-tier OCR rewrite)

- **Plan**: `context/changes/first-pdf-to-report/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-01
- **Verdict**: REVISE → SOUND after triage (all 5 findings fixed)
- **Findings**: 0 critical | 3 warnings | 2 observations

> Note: supersedes an earlier stale review that targeted the pre-OCR ("Phase 1a CMap
> injection") version of the plan.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

9/9 existing paths ✓ · new paths absent ✓ · `GARBLED` seam @ `PdfExtractor.ts:150` ✓ ·
`extractions.upload_id` UNIQUE ✓ · `reports.user_id` PK ✓ · config.toml current values
read (site_url 127.0.0.1:3000, enable_confirmations false) ✓ · middleware `startsWith`
guard ✓ · brief↔plan consistent ✓ · Progress↔Phase mechanical contract ✓ (one `## Progress`,
all phases/criteria mapped, no stray checkboxes).

## Findings

### F1 — Magic Link callback assumes ?code=; local template may deliver token_hash

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Phase 2, Steps 1 & 2 (signin.ts, callback.astro)
- **Detail**: callback.astro hard-codes `exchangeCodeForSession(code)`. Whether the Inbucket Magic Link carries `?code=` (→exchangeCodeForSession) or `token_hash` (→verifyOtp) is template/version dependent and unverified. PKCE also needs the verifier cookie from the server-side `signInWithOtp` request to survive to the callback — cross-device opens break it. No fallback described.
- **Fix A ⭐ Recommended**: Add a ≤10-min Phase 2 spike — send a link locally, inspect Inbucket params, branch callback (code vs token_hash/verifyOtp), record in change.md.
- **Fix B**: Default to token_hash + verifyOtp and override the email template to `{{ .TokenHash }}`.
- **Decision**: FIXED via Fix A (callback.astro contract now branches code vs token_hash, with a verify-first spike + cross-device note)

### F2 — One deterministic parser must cover 3 provider layouts + OCR noise, tested on 1 fixture

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 3, Step 3 (parser.ts) + Desired End State
- **Detail**: End state needs reports from ALAB + Enel Med (text) AND Diagnostyka (OCR) via one parser with no template detector, but parser.ts contract is "regex for section headers and row format" and 3.3 tests only one fixture. Phase 3 can pass green while 2 of 3 real providers fail; the gap surfaces only at the E2E run.
- **Fix A**: Multi-provider fixtures + per-provider Phase 3 assertions.
- **Fix B**: Narrow declared provider scope for v1.
- **Decision**: FIXED differently — **Diagnostyka-first, others best-effort**. v1 parser targets the Diagnostyka layout; ALAB/Enel Med parse best-effort and a non-fit lands `status: 'failed'` with a message (no wrong report). Phase 3 verifies a Diagnostyka OCR-text fixture + at least one clean-text fixture under `scripts/fixtures/`; Desired End State and Progress 3.3 updated to match.

### F3 — /api/upload has no stated auth/authorization guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 4, Step 3 (api/upload.ts)
- **Detail**: Contract validates file/extracted_text/source but never resolves/checks the user. Middleware's `startsWith("/upload")` does not match `/api/upload`, so the endpoint must self-check; without it an unauthenticated POST 500s or relies on RLS alone.
- **Fix**: Resolve `userId` from `context.locals.user`; return 401 if absent; pass the request-scoped supabase client so RLS applies.
- **Decision**: FIXED (auth guard added to the api/upload.ts contract)

### F4 — config.toml enable_confirmations is currently false; plan said "confirm true"

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, Step 7 (supabase/config.toml)
- **Detail**: Step 7 said "confirm enable_confirmations = true" but the live value is `false`; there are also two `enable_signup` keys. "Confirm" implied no change when the intent was ambiguous.
- **Fix**: State exact target values; clarify `enable_confirmations` stays `false` for OTP; disambiguate the two `enable_signup` keys.
- **Decision**: FIXED

### F5 — change.md Notes still say "blocked / OCR out of scope" — contradicts this plan

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: change.md Notes vs plan Overview
- **Detail**: change.md frontmatter is `planned/reframed` but its Notes still declare the change "blocked" and OCR "out of current PRD/plan," predating Frame Brief II which this plan implements.
- **Fix**: Add a dated "Unblocked via OCR reframe" entry superseding the stale block.
- **Decision**: FIXED (dated supersede note added to change.md; status set to `plan_reviewed`)
