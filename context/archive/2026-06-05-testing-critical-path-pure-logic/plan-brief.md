# Testing Critical Path Pure Logic — Plan Brief

> Full plan: `context/changes/testing-critical-path-pure-logic/plan.md`
> Research: `context/changes/testing-critical-path-pure-logic/research.md`

## What & Why

Bootstrap Vitest from zero and make Phase 1 of the test-plan rollout land green. The project has no automated tests today; risks #2 (parser silently mangling lab values) and #7 (duplicate/missing report sections) are unprotected. This change adds a passing test suite that pins the parser and merge contracts using real OCR fixtures and hand-authored golden oracles.

## Starting Point

No test runner, no test files. `parseLabText` and `mergeReportContent` are fully I/O-free pure-TS functions ready for unit tests. Two real-OCR fixtures with golden oracles exist at `scripts/fixtures/`; the current parser produces 0/28 and 0/5 full matches against them — all failures are unit/refRange parsing bugs, not date extraction bugs.

## Desired End State

`npm test` runs and passes with 0 failures. `parseLabText` produces the oracle-correct output for 23/28 Diagnostyka and 4/5 ALAB items (6 rows with unrecoverable OCR corruption are skipped with explanatory comments). `LabItem.date` is `string | null`; no-date text returns `null` items instead of silently substituting today's date. Merge and SQL-parity tests cover risk #7.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-----------------|--------|
| Parser improvement scope | Tests + fixes in one change (all tests green) | Delivering a passing suite closes risks immediately; research already mapped every fix needed | Plan |
| OCR-misread policy | Skip 6 rows with `it.skip` + comment; do not lower oracle | Fixture text is authentic raw OCR; oracle reflects requirements — degrading the oracle conflates bugs with data limits | Plan |
| Date fallback | `extractReportDate` returns `string \| null`; remove `new Date()` fallback | Silent today-substitution is incorrect product behavior; callers should decide how to handle undated text | Plan |
| Test location | `tests/unit/*.test.ts` | Clean separation from `src/`; single Vitest `include` glob; natural extension path for Phase 2 integration tests | Plan |
| ALAB coverage | Both oracles asserted in Phase 1 | ALAB fixture is tiny (5 items) and em-dash fix is low-risk alongside the Diagnostyka MIN/MAX fix | Plan |
| `debug:pdf` script | Remove from `package.json` | References deleted file; zero-risk cleanup | Plan |

## Scope

**In scope:**
- Vitest devDependency + `vitest.config.ts` + `test`/`test:watch` npm scripts
- `LabItem.date: string | null` type change + `extractReportDate` returns `null`
- Parser fixes: strip `*`/`'` artifacts, Diagnostyka MIN/MAX→refRange, ALAB em-dash refs, noise-row denylist, dedup key includes unit
- `tests/unit/parser.test.ts` — fixture-oracle + targeted unit tests
- `tests/unit/reports.test.ts` — buildReportSection, mergeReportContent, SQL-parity helper

**Out of scope:**
- CI gate (`npm test` in GitHub Actions) — Phase 4
- Integration tests (mocked Supabase, upload pipeline) — Phase 2
- RLS / cross-tenant tests — Phase 3
- Decimal-insertion heuristics for OCR misreads
- Workers/Miniflare test pool

## Architecture / Approach

Pure Node Vitest — no browser, no Workers. `parser.ts` and `reports.ts` import only types and plain TS; they work in any environment. The `@/` path alias is mirrored in `vitest.config.ts` using `new URL('./src/', import.meta.url).pathname`. Test files import from Vitest explicitly (no globals config). The `sqlAppend` parity helper is a three-line pure function defined in the test file itself — no additional production code.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Vitest Bootstrap | Working `npm test` command (zero tests pass) | Vitest version must align with `vite ^7.3.2` override |
| 2. Date API → null | `LabItem.date: string \| null`; no silent today-fallback | TypeScript propagation — any non-null assumption in codebase must be fixed |
| 3. Parser Bug Fixes | All systematic parsing failures corrected; `verify:parser` shows correct output | Noise denylist may need tuning; MIN/MAX regex must not break existing formats |
| 4. Test Files | `npm test` passes 0-failure; oracle coverage 23/28 + 4/5 | Unexpected oracle failures → add to skip list with OCR artifact comment |

**Prerequisites:** None beyond a working `npm install`. No Docker, no Supabase, no environment variables.
**Estimated effort:** ~1 focused session across 4 phases.

## Open Risks & Assumptions

- The noise-row denylist is tuned to two known fixtures; future OCR providers may produce different header/footer patterns that bypass it.
- Six OCR-corruption rows are skipped — if more are discovered during Phase 4, the skip list grows. This is acceptable; it does not invalidate the test suite.
- `buildReportSection` in `reports.ts` uses `new Date()` for null-date items; the mock-clock test (`vi.useFakeTimers`) is the only place in Phase 1 where timer mocking is needed.

## Success Criteria (Summary)

- `npm test` exits 0 — all tests pass, skipped rows are visible in output.
- `npm run lint && npm run build` both pass — no type regressions from `date: string | null`.
- `npm run verify:parser` still works — NRBC pair visible in Diagnostyka output, no noise items in either fixture's output.
