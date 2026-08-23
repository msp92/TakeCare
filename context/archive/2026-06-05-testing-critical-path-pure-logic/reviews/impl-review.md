<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testing Critical Path Pure Logic

- **Plan**: context/changes/testing-critical-path-pure-logic/plan.md
- **Scope**: Phases 1–4 (full plan)
- **Date**: 2026-06-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Uncommitted verify-parser / fixture rename

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: scripts/verify-parser.ts, scripts/fixtures/alab-clean.txt
- **Detail**: Committed `verify-parser.ts` loads `alab-clean.txt` (still in HEAD). Working tree has unstaged edits switching to `alab-ocr.txt` and deletes `alab-clean.txt`. Plan excluded verify-parser changes, but the rename aligns the dev helper with Vitest's real-OCR oracle fixture. Until committed, teammates on a clean checkout keep the old helper; anyone who deletes `alab-clean.txt` locally breaks `npm run verify:parser`.
- **Fix A ⭐ Recommended**: Commit the verify-parser rename to `alab-ocr.txt`, delete `alab-clean.txt`, add a one-line plan addendum noting the dev-helper alignment.
  - Strength: Single fixture source for ALAB; smoke script matches test oracle.
  - Tradeoff: Slight plan scope expansion (documented).
  - Confidence: HIGH — unstaged diff is already written and tests use `alab-ocr`.
  - Blind spot: Whether `alab-clean.txt` is still needed for non-OCR debugging.
- **Fix B**: Revert working-tree changes; keep `alab-clean.txt` and committed verify-parser as-is.
  - Strength: Strict plan boundary.
  - Tradeoff: Two ALAB fixtures with divergent purposes; manual helper doesn't match test fixture.
  - Confidence: MEDIUM — committed state works today.
  - Blind spot: Future confusion about which ALAB fixture is canonical.
- **Decision**: FIXED via Fix A — verify-parser → alab-ocr.txt, alab-clean.txt removed, plan addendum added (uncommitted)

### F2 — Redundant magic number in Diagnostyka match test

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/unit/parser.test.ts:57
- **Detail**: Test already computes `expectedMatchCount` from the skip list (line 47) and asserts `matches === expectedMatchCount` (line 56). Line 57 adds `expect(matches).toBe(22)` — duplicates the computed assertion and will drift if the oracle grows.
- **Fix**: Remove line 57 (`expect(matches).toBe(22)`).
- **Decision**: FIXED

### F3 — Inconsistent ALAB OCR skip pattern

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/unit/parser.test.ts:93–99
- **Detail**: Diagnostyka uses `DIAG_OCR_SKIP_NAMES_UNITS` + `isOcrSkip()` helper. ALAB inlines `if (exp.name === "Kwas moczowy..." && exp.unit === "mg/dL")` in the loop. Plan's skip-table pattern favors a named constant for both fixtures.
- **Fix**: Add `ALAB_OCR_SKIP_NAMES_UNITS` constant (one entry) and reuse `isOcrSkip()` in the ALAB describe block.
- **Decision**: FIXED

### F4 — Fixture I/O at describe collection time

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/unit/parser.test.ts:38–40, 85–87
- **Detail**: `loadFixture()` and `parseLabText()` run when Vitest collects the describe block, not inside `beforeAll`. Missing fixture files would fail at import/collection with a less clear stack trace. Common Vitest pattern; not broken.
- **Fix**: Wrap fixture load + parse in `beforeAll` and assign to `let` variables used by `it` blocks.
- **Decision**: FIXED
