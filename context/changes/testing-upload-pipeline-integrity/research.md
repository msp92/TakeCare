---
date: 2026-06-07T00:00:00+00:00
researcher: Cursor Agent
git_commit: d456250b710528332094898b66669a96318b56af
branch: main
repository: TakeCare
topic: "Rollout Phase 2 — Upload pipeline integrity (Risks #3, #5, #6)"
tags: [research, testing, upload, auth, integration, vitest]
status: complete
last_updated: 2026-06-07
last_updated_by: Cursor Agent
---

# Research: Rollout Phase 2 — Upload pipeline integrity

**Date**: 2026-06-07  
**Researcher**: Cursor Agent  
**Git Commit**: `d456250b710528332094898b66669a96318b56af`  
**Branch**: `main`  
**Repository**: TakeCare

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` for risks #3 (upload partial success / cleanup), #5 (garbage `extracted_text` → clean 4xx), and #6 (unauthenticated access to pages/APIs). Verify risk response guidance against live code; locate failure paths, auth enforcement, existing tests, and the cheapest integration test layer (mocked Supabase).

## Summary

The upload pipeline is a thin API handler (`POST /api/upload`) delegating to injectable `processUpload`, which runs: DB insert → storage upload → `parseLabText` → RPC `complete_upload_processing`. Compensating cleanup exists for post-storage failures but is best-effort; upload rows are never deleted, and status can remain `processing` if `markUploadFailed` fails.

**Risk #3** is partially mitigated (RPC is atomic; cleanup runs on parse/RPC failure) but integration tests must assert persisted artifact state, not HTTP status alone. Residual gaps: stuck `processing`, ignored cleanup I/O errors, orphan report section if RPC succeeds but return shape is wrong, duplicate sections on retry.

**Risk #5** is confirmed: schema-valid, non-empty, unparseable text passes Zod, reaches `processUpload`, triggers cleanup, but the API maps the parse rejection to **500** — not the predictable 4xx the test plan requires. Zod-only cases (empty, bad source, oversize) correctly return 400.

**Risk #6** uses two independent paths: middleware redirects unauthenticated users from `/dashboard` and `/upload`; `/api/upload` has an explicit 401 handler check. Middleware does not cover `/api/*`. Magic Link callback (`GET /auth/callback`) is public by design and establishes session via `handleAuthCallback`. No auth tests exist today.

**Cheapest test layer:** Tier A — mock `SupabaseClient` injected into `processUpload` (Risk #3); Tier B — middleware + `handleAuthCallback` with `vi.mock("@/lib/supabase")` (Risk #6); Tier C — invoke `POST` from `upload.ts` with stub `APIContext` (Risk #5 HTTP classes). No new deps required initially; Workers pool deferred.

## Detailed Findings

### Risk #3 — Upload pipeline atomicity and cleanup

#### Entry point and flow

| Layer | File | Role |
|-------|------|------|
| HTTP | `src/pages/api/upload.ts:16–83` | Auth, Zod + file validation, delegates to `processUpload`, 302 on success / 500 on failure |
| Service | `src/lib/services/uploads.ts:15–88` | Orchestrates DB → storage → parse → RPC |
| SQL RPC | `supabase/migrations/20260602120000_complete_upload_processing_rpc.sql` | Atomic: extraction insert + report append + upload → `succeeded` |

Ordered server steps in `processUpload`:

1. `INSERT uploads` with `status: "processing"` (`uploads.ts:33–40`)
2. `storage.upload` to `lab-pdfs/{userId}/{uploadId}.pdf` (`uploads.ts:46–50`)
3. `parseLabText(extractedText)` (`uploads.ts:57`)
4. `rpc("complete_upload_processing", …)` (`uploads.ts:71–75`)

Client-side PDF extraction runs in `UploadForm.tsx` before POST; server stores PDF only after step 2.

#### Failure matrix

| Step | Trigger | Cleanup | Upload row | Storage | Extraction | Report |
|------|---------|---------|------------|---------|------------|--------|
| Pre-insert validation | Bad MIME/size in service | None | — | — | — | — |
| DB insert fail | `insertError` | None | **None** | — | — | — |
| Storage fail | `storageError` | `markUploadFailed` only | `failed` if mark OK; else **`processing`** | Not created | — | — |
| Parse fail (`items.length === 0`) | Unparseable text | `cleanupUploadArtifacts` | `failed` (best-effort) | Removed | Deleted (no-op pre-RPC) | Unchanged |
| RPC fail | `rpcError` | `cleanupUploadArtifacts` | `failed` (best-effort) | Removed | Rolled back | Unchanged |
| Bad RPC return shape | `reportContent` not string | `cleanupUploadArtifacts` | `failed` (best-effort) | Removed | Deleted | **May remain appended** |
| Success | — | — | `succeeded` | Present | Present | Appended |

Cleanup helpers (`uploads.ts:90–107`):

- `markUploadFailed` — strict; throws if update fails
- `cleanupUploadArtifacts` — deletes extractions, removes storage, best-effort `markUploadFailed` (swallows mark failure → status may stay `processing`)

#### HTTP success vs persisted state

302 redirect (`upload.ts:75`) is returned only after `processUpload` resolves without throw — implying `succeeded` upload, storage object, extraction row, and report append all committed via RPC.

HTTP 500 does **not** guarantee cleanup completed: storage-failure path can leave `processing`; cleanup I/O errors are not checked; retry after lost success response creates duplicate report sections (no idempotency).

#### Test-plan alignment

| Guidance | Verified? | Notes |
|----------|-----------|-------|
| Prove mid-upload failure leaves no succeeded record | Partially | Status never `succeeded` on failure paths; `failed` or `processing` row persists |
| Challenge HTTP success = all data persisted | Yes | 302 implies full RPC commit; inverse gap is lost response + retry duplicate |
| Avoid asserting only HTTP status | Required | Must mock and assert Supabase call sequence + final artifact state |

### Risk #5 — Bad `extracted_text` rejection classes

#### Schema vs parser validation

**Zod (API layer)** — `upload.ts:11–14`:

```typescript
extracted_text: z.string().min(1).max(MAX_EXTRACTED_TEXT_CHARS)
source: z.enum(["text", "ocr"])
```

**Imperative API checks:** file presence, PDF MIME, file size (`upload.ts:32–68`).

**Parser layer:** `parseLabText` returns `[]` for unparseable input; never throws (`parser.ts:113–156`). Rejection at `uploads.ts:57–60`.

#### Rejection classes and HTTP mapping

| Class | Example | Status | Location |
|-------|---------|--------|----------|
| Empty / whitespace | `""` after trim | **400** | Zod `min(1)` → `upload.ts:44–54` |
| Schema-invalid | bad `source`, text > 1 MB | **400** | Zod → `upload.ts:44–54` |
| File invalid | no file, wrong MIME, too large | **400** | `upload.ts:32–68` |
| Valid-but-unparseable | `"lorem ipsum…"`, noise-only headers | **500** today | `uploads.ts:58–60` → `upload.ts:76–81` |

No **422** anywhere in `src/`. Archived plan documents validation → 400, processing → 500 (`context/archive/2026-05-28-first-pdf-to-report/plan.md`).

**Gap vs test-plan:** Risk #5 requires predictable **4xx** for valid-but-unparseable non-empty input. Current code returns 500 with message `"Could not parse any lab results from the extracted text"`. Side effects before parse failure: upload row inserted + PDF stored, then cleanup attempted.

**Fix direction (for plan phase):** Distinguish parse rejection (custom error class) and map to 422 in `upload.ts` catch; optionally reject before DB insert to avoid partial state on pure validation failures.

### Risk #6 — Auth enforcement (pages vs APIs)

#### Middleware — page routes

`src/middleware.ts:4–21`:

- `PROTECTED_ROUTES = ["/dashboard", "/upload"]`
- Prefix match via `startsWith`
- Unauthenticated → `redirect("/auth/signin")`
- Resolves `context.locals.user` via `createClient` + `getUser()` on every request

Protected pages:

| Route | File | Guard |
|-------|------|-------|
| `/dashboard` | `src/pages/dashboard.astro` | Middleware |
| `/upload` | `src/pages/upload.astro` | Middleware |

#### API handlers — explicit auth

Only three API routes under `src/pages/api/`:

| Handler | Auth | Behavior |
|---------|------|----------|
| `POST /api/upload` | **Yes** — `upload.ts:20–24` | 401 JSON if no user/supabase |
| `POST /api/auth/signin` | No (public) | OTP trigger |
| `POST /api/auth/signout` | No | Idempotent sign-out |

`/api/upload` is **not** in `PROTECTED_ROUTES` (prefix `/upload` does not match `/api/upload`).

#### Magic Link callback

Flow: `SignInForm` → `POST /api/auth/signin` → email link → `GET /auth/callback` → `handleAuthCallback` (`src/lib/auth/handleAuthCallback.ts:20–60`) → session cookies → redirect to `/dashboard` or `/upload`.

Callback is public (establishes session). Test scope: verify session is set after valid callback; verify protected routes/APIs deny access **before** callback.

#### Regression risk

Any future `/api/*` route without explicit handler auth would be reachable without middleware redirect. Only RLS would remain.

### Test infrastructure

| Item | State |
|------|-------|
| Runner | Vitest 4, Node env (`vitest.config.ts`) |
| Include glob | `tests/**/*.test.ts` — covers `tests/integration/` without config change |
| Existing tests | `tests/unit/parser.test.ts`, `tests/unit/reports.test.ts` only |
| Integration tests | None |
| CI | Lint + build only; `npm test` not gated (Phase 4) |

#### Mock strategy (cost × signal)

| Tier | Target | Risks | Cost |
|------|--------|-------|------|
| **A** | `processUpload(supabase, …)` with fake `SupabaseClient` | #3, #5 parse path | Low |
| **B** | `middleware.ts` + `handleAuthCallback` with `vi.mock("@/lib/supabase")` | #6 | Low–medium |
| **C** | Import `POST` from `upload.ts` + stub `APIContext` | #5 HTTP classes, #6 401 | Medium |
| **D** | `@cloudflare/vitest-pool-workers` | Full SSR fidelity | Deferred |

Mock at Supabase client boundary per test-plan §4 — not parser/reports internals.

Suggested shared helper: `tests/helpers/mockSupabase.ts` with fluent chains for `from().insert()`, `storage.from().upload()`, `rpc()`, cleanup calls.

### Risk response guidance verification

| Risk | Test-plan intent | Research verdict |
|------|------------------|------------------|
| #3 | No succeeded record; persisted state matches failure | **Verify via Tier A** — assert mock call order, status never `succeeded`, storage removed, RPC not called on failure; include stuck-`processing` and retry-duplicate edge cases |
| #5 | Non-empty unprocessable → predictable 4xx | **Gap confirmed** — current 500; tests should encode desired 422 (may require small prod fix first or red test) |
| #6 | Pages and APIs deny independently | **Architecture confirmed** — separate middleware redirect vs handler 401; test both paths; do not rely on single middleware test |

## Code References

- `src/pages/api/upload.ts:16–83` — Upload API handler, Zod validation, 401/400/500 mapping
- `src/lib/services/uploads.ts:15–107` — `processUpload`, cleanup helpers
- `src/lib/services/parser.ts:113–156` — `parseLabText` (returns `[]`, never throws)
- `src/middleware.ts:4–24` — `PROTECTED_ROUTES`, session resolution
- `src/lib/supabase.ts:5–23` — Cookie-based SSR client (mock injection point)
- `src/lib/auth/handleAuthCallback.ts:20–60` — Magic Link session exchange
- `src/pages/auth/callback.ts:7–19` — Callback route
- `supabase/migrations/20260602120000_complete_upload_processing_rpc.sql` — Atomic completion RPC
- `tests/unit/parser.test.ts:157–162` — Oracle for empty/unparseable parser behavior
- `context/foundation/test-plan.md:56–59,71,83` — Phase 2 scope and risk response guidance

## Architecture Insights

1. **Thin API, fat service** — `processUpload` accepts injected `SupabaseClient`, making Tier A integration tests the cheapest high-signal layer for pipeline integrity.
2. **Storage outside transaction** — PDF upload cannot join Postgres tx; compensating `storage.remove` on failure is intentional but fallible (documented in archived impl-review F2).
3. **Dual auth paths** — Pages use middleware redirect; APIs must self-guard. This matches test-plan Risk #6 design intent.
4. **Parse rejection is a processing error today** — Collapsed into generic 500 catch block; Risk #5 tests need explicit HTTP class distinction.

## Historical Context

- `context/changes/testing-critical-path-pure-logic/research.md` — Deferred integration tests and `astro:env/server` mocking to Phase 2; unit tests cover parser/merge only.
- `context/changes/testing-critical-path-pure-logic/plan.md:42–44` — Out of scope for Phase 1: Workers pool, API integration.
- `context/archive/2026-05-28-first-pdf-to-report/reviews/impl-review.md` — Original orphan-problem (Fix A: RPC + compensating storage cleanup) implemented; residual fallibility remains.

## Related Research

- `context/changes/testing-critical-path-pure-logic/research.md` — Parser fixtures, merge parity, Vitest bootstrap

## Open Questions

1. **Risk #5 implementation vs test-first:** Should Phase 2 add a 422 mapping in `upload.ts` before/alongside tests, or write failing integration tests that document the gap?
2. **Parse-before-persist:** Should unparseable text be rejected before DB insert + storage upload to simplify Risk #3 cleanup assertions?
3. **Magic Link callback test depth:** Session-establishment smoke only, or full PKCE/`verifyOtp` branch coverage?
4. **Post-research backport:** No §2 Source column corrections needed; Risk #5 response guidance is confirmed accurate (implementation lags intent).

## Recommended test matrix (for `/10x-plan`)

### Tier A — `processUpload` failure injection

| # | Injected failure | Assert |
|---|------------------|--------|
| 1 | `insert` error | No storage/RPC calls |
| 2 | `storage.upload` error | Status not `succeeded`; no extraction; no RPC |
| 3 | Unparseable text | Cleanup called; status not `succeeded`; no RPC |
| 4 | `rpc` error | Cleanup called; report unchanged |
| 5 | `markUploadFailed` fails during cleanup | Status may stay `processing` (document gap) |
| 6 | Second success after first | Duplicate report sections (retry scenario) |

### Tier B — Auth

| # | Target | Assert |
|---|--------|--------|
| 1 | Middleware, `/dashboard` no user | Redirect `/auth/signin` |
| 2 | Middleware, `/upload` no user | Redirect `/auth/signin` |
| 3 | `POST /api/upload` no user | 401 JSON (independent of middleware) |
| 4 | `handleAuthCallback` valid code | Session cookies set; redirect to allowlisted path |

### Tier C — API validation classes

| # | Input | Assert |
|---|-------|--------|
| 1 | Empty `extracted_text` | 400 |
| 2 | Valid-but-unparseable text | **422** (desired; red until implemented) |
| 3 | Happy path fixture text | Redirect 302 or mock success |
