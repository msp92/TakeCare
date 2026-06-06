<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testing Critical Path Pure Logic — Phase 1

- **Plan**: context/changes/testing-critical-path-pure-logic/plan.md
- **Scope**: Phase 1 of 4
- **Date**: 2026-06-06
- **Commit**: 67d6cdc
- **Verdict**: APPROVED (after triage)
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unplanned canvas devDependencies in Phase 1 commit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: package.json (67d6cdc)
- **Detail**: Commit `67d6cdc` added `@napi-rs/canvas` and `canvas` to `devDependencies`. Phase 1 plan only specified `vitest`. Parent commit had neither package; they appeared as a side effect of `npm install --legacy-peer-deps` resolving unpdf peer conflicts. Not required for Vitest bootstrap.
- **Fix A ⭐ Recommended**: Revert canvas packages from this change — remove `@napi-rs/canvas` and `canvas` from `devDependencies`, run `npm install`, confirm `npm test` / `npm run build` still pass.
  - Strength: Keeps Phase 1 diff minimal and aligned with plan.
  - Tradeoff: `npm install` may warn on unpdf peer deps until addressed separately.
  - Confidence: HIGH — vitest does not depend on canvas.
  - Blind spot: Another script may rely on canvas locally (verify `verify:parser` / PDF tooling).
- **Fix B**: Document canvas as intentional dev tooling in plan/research and keep.
  - Strength: Silences peer-dep warnings for unpdf locally.
  - Tradeoff: Expands Phase 1 scope without plan approval.
  - Confidence: MEDIUM — motivation unclear from diff alone.
  - Blind spot: CI install path may differ from local `--legacy-peer-deps`.
- **Decision**: FIXED via Fix A — removed `@napi-rs/canvas` and `canvas` from devDependencies

### F2 — `--passWithNoTests` not in plan script contract

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: package.json:16
- **Detail**: Plan specified `"test": "vitest run"`. Implementation uses `vitest run --passWithNoTests` because Vitest 4 exits 1 when no tests exist. Behavior matches success criteria (exit 0, "No test files found").
- **Fix**: Add a one-line note to Phase 1 plan or plan-brief documenting Vitest 4 `--passWithNoTests` requirement.
- **Decision**: FIXED — documented in Phase 1 `package.json` contract block

### F3 — Progress SHA write-back uncommitted

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/testing-critical-path-pure-logic/plan.md
- **Detail**: Progress rows 1.1–1.5 carry `— 67d6cdc` suffixes but `plan.md` is modified and unstaged after the phase commit. Expected per implement ritual (SHA lands post-commit); will need a follow-up commit before archive.
- **Fix**: Stage and commit `plan.md` SHA write-back (or include in Phase 2 opening commit).
- **Decision**: FIXED — committed with review-fix follow-up
