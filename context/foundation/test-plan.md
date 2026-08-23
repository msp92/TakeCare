# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-06

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team is
   worried about X, and the failure would surface somewhere in the upload or
   parser path" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`, `scripts/`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | User A sees User B's uploads, PDFs, extractions, or report | High | Low | interview Q1; PRD §Guardrails; roadmap F-01 — RLS and bucket rules implemented; residual risk is regression or misconfiguration |
| 2 | Parser silently produces wrong lab values — decimal mangled, unit dropped, wrong date (including date fallback using today's date when no pattern matches) | High | High | interview Q1, Q3; roadmap S-01 parser risk; PRD FR-003, FR-004 |
| 3 | Upload appears to succeed but report/storage/cleanup is wrong — partial success, stuck processing, or duplicate sections on retry | High | Medium | interview Q3; PRD US-01 AC; upload flow active dev surface |
| 4 | Authenticated user accesses another user's resource by known UUID (IDOR) | High | Medium | PRD §Access Control; abuse lens (auth ≠ ownership) |
| 5 | Server accepts garbage `extracted_text` from client — unparseable non-empty input yields 500 instead of clean 4xx | High | Medium | abuse lens (untrusted input); upload architecture (client extracts, server parses posted text) |
| 6 | Unauthenticated user reaches protected pages or APIs — middleware for pages, explicit handler checks for APIs | Medium | Medium | hot-spot dir `src/pages/api/auth/` (3 commits/30d); hot-spot `src/middleware.ts` (2 commits/30d); PRD FR-001 |
| 7 | Second or later PDF upload produces duplicate, missing, or mis-ordered report sections — current MVP behavior via RPC append | Medium | Medium | PRD FR-005; roadmap S-02; dual merge implementations may diverge |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Cross-tenant operations denied at database/storage layer even when attempted via API | "Policies enabled" ≠ correct for every operation on every table and bucket | Isolation guarantees per table and storage bucket; which operations each policy covers | RLS regression tests (two-user fixture, local Docker Supabase) | Testing only with service-role key; never asserting explicit denial |
| #2 | Known Diagnostyka fixture text → expected structured output with correct date, values, units | "Non-empty result" ≠ correct values; today's date in fallback ≠ result date | Owner-supplied fixture text; golden output from requirements not implementation; date extraction contract | Unit tests on pure parse function with fixture strings | Oracle copied from implementation; only one happy-path fixture |
| #3 | Any failure mid-upload leaves no succeeded record; persisted state matches failure (upload failed, extraction absent, storage removed) | HTTP success means all data persisted; HTTP error means cleanup completed | Atomicity contract of upload pipeline; persisted state after each failure point; retry when response is lost | Integration tests simulating failures at each step, asserting DB + storage state | Asserting only HTTP status; not verifying cleanup of all three artifacts |
| #4 | Session for user A cannot retrieve or modify user B's records with correct UUIDs | Middleware session check ≠ per-resource ownership | Per-resource ownership in API handlers and storage path rules | Two-fixture API + RLS integration tests | Testing session auth alone without resource-level denial |
| #5 | Non-empty unprocessable input yields explicit predictable error — not silent success or unhandled 500 | Schema-valid input ≠ processable by parser | Rejection criteria: empty, schema-invalid, valid-but-unparseable; correct HTTP status per class | API integration tests per bad-input class | Testing only Zod-caught cases; missing valid-but-unparseable class |
| #6 | Page routes and API routes both return 401/redirect with no session — two enforcement paths independent | Passing middleware test ≠ API handler self-check correct | PROTECTED_ROUTES for pages; explicit auth guard per API handler; session after Magic Link callback | Middleware unit tests + per-handler auth integration tests | Single middleware test standing in for all auth coverage |
| #7 | After N uploads, report has exactly N date sections in order, no duplication — SQL append and TS merge agree | String concatenation ≠ correct longitudinal merge; implementations may diverge | Append contract for both paths; which path production uses | Unit tests on TS merge; parity test both implementations agree | Snapshot of full Markdown without section count or order assertions |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Critical-path pure logic | Bootstrap Vitest; fixture-oracle parser tests + merge parity | #2, #7 | unit | complete | context/changes/testing-critical-path-pure-logic/ |
| 2 | Upload pipeline integrity | Upload failure/cleanup state, bad-input classes, Magic Link callback | #3, #5, #6 | integration (mocked Supabase) | researched | context/changes/testing-upload-pipeline-integrity/ |
| 3 | Tenant isolation & abuse | Automate cross-tenant denial + IDOR; Supabase Docker in CI | #1, #4 | RLS + API two-fixture tests | not started | — |
| 4 | Quality-gates wiring | `npm test` in CI alongside lint/build | cross-cutting | CI gate | not started | — |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit | Vitest | ^4.1.8 | Plain Node (`vitest.config.ts`); `tests/unit/*.test.ts`; `@/` alias; see @AGENTS.md |
| integration | TBD | — | Research in Phase 2 — mock at Supabase edge only |
| e2e | deferred | — | Frontend stable per interview Q5; deterministic layers first |
| accessibility | none | — | Out of scope for MVP rollout |
| (optional) AI-native | deferred | n/a | No signal beyond deterministic tests for current risks |

**Stack grounding tools (current session):**
- Docs: Context7 MCP — available; validate Vitest/Astro/Supabase test setup at plan time; checked: 2026-06-05
- Search: web search MCP — available; not yet used for test tooling; checked: 2026-06-05
- Runtime/browser: cursor-ide-browser MCP — available; defer until deterministic layers insufficient; checked: 2026-06-05
- Provider/platform: GitHub MCP — available; Phase 4 CI gate wiring; checked: 2026-06-05

Phase 3 RLS tests require Supabase Docker in CI — current workflow runs lint + build only; researcher must surface required CI step before Phase 4 gate is complete.

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 1 | logic regressions |
| e2e on critical flows | CI on PR | deferred | UI stable; not in rollout budget |
| post-edit hook | local | not planned | — |
| visual diff | CI on PR | not planned | interview Q5 negative space |
| pre-prod smoke | merge + prod | optional | environment-specific failures |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships.

### 6.1 Adding a unit test

Shipped in rollout Phase 1 (`testing-critical-path-pure-logic`).

1. Add `tests/unit/<area>.test.ts` — import from `vitest` directly; import app code via `@/…`.
2. **Parser changes:** use fixture-oracle pattern — `scripts/fixtures/*-ocr.txt` + matching `*.expected.json`. Load in `beforeAll`. Assert non-skipped oracle rows with `toContainEqual`; use `it.skip` + comment for uncorrectable OCR corruption (never lower the oracle).
3. **Pure helpers** (`src/lib/services/`): inline fixture strings for targeted contracts; no Astro/Supabase/Workers deps.
4. **Merge/report logic:** assert behavior + document known SQL/TS parity gaps explicitly (`not.toBe` only when divergence is intentional).
5. Run `npm test && npm run lint && npm run build` before PR.

Reference: @tests/unit/parser.test.ts, @tests/unit/reports.test.ts, @AGENTS.md §Testing.

### 6.2 Adding an integration test

TBD — see §3 Phase 2 (upload failure state assertions, bad-input API tests).

### 6.3 Adding an RLS / tenant isolation test

TBD — see §3 Phase 3 (two-user fixture, cross-tenant denial pattern).

### 6.4 Adding a test for a new API endpoint

TBD — see §3 Phase 2 (handler-level auth + validation; mock Supabase at edge).

### 6.5 Running tests locally and in CI

**Local (shipped Phase 1):**

```bash
npm test              # single run (21 passed, 7 skipped as of Phase 1)
npm run test:watch    # watch mode
npm run verify:parser # manual smoke — prints parsed fixture JSON
```

CI gate (`npm test` in `.github/workflows/ci.yml`) — **not wired yet**; see §3 Phase 4.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5).

- **Frontend styling and layout** — stable once set; small personal app with low UI churn. Re-evaluate if upload/dashboard flows gain significant new UI. (Source: Phase 2 interview Q5.)
- **Marketing / landing pages** — rarely change; no data risk. (Source: Phase 2 interview Q5.)
- **Browser e2e and visual snapshots** — deterministic unit and integration tests should catch parser/upload/auth regressions first. (Source: cost × signal principle.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-05
- Stack versions last verified: 2026-06-06
- AI-native tool references last verified: 2026-06-05

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
