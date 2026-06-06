# Testing Critical Path Pure Logic — Implementation Plan

## Overview

Bootstrap Vitest from zero, write fixture-oracle tests for `parseLabText` and merge-parity tests for `mergeReportContent` / `buildReportSection`, fix the four parser bug categories the real-OCR oracles reveal, and change the date-fallback API to return `null` — so all Phase 1 tests end green and risks #2 and #7 from the test plan are covered.

## Current State Analysis

- No test runner, no `*.test.ts` files anywhere in the project.
- `parser.ts` and `reports.ts` import only types and plain TS; no Astro, Supabase, or Workers deps — Vitest runs in plain Node without Miniflare.
- `package.json` overrides `vite` to `^7.3.2`; Vitest config must align with this.
- `tsconfig.json` includes `**/*` — test files under `tests/` are automatically covered by TypeScript and ESLint.
- Two real-OCR fixtures with hand-authored golden oracles at `scripts/fixtures/`:
  - `diagnostyka-ocr.txt` / `diagnostyka-ocr.expected.json` — 28 oracle items
  - `alab-ocr.txt` / `alab-ocr.expected.json` — 5 oracle items
- Current parser produces **0/28 and 0/5 full matches** against the oracles. Date extraction works correctly (both fixtures' dates are picked up). All failures are unit/refRange mismatches from four systematic bug categories.
- `LabItem.date` is currently `string` (non-optional). `extractReportDate` falls back to `new Date().toISOString().slice(0, 10)` when no pattern matches — silently substituting today's date is considered incorrect product behavior.

### Key Discoveries

- `parser.ts:3–7` — `DATE_PATTERNS` priority is correct; labeled `data wykonania:` wins. No date-extraction bugs.
- `parser.ts:96–100` — dedup key is `name:value`; same analyte reported in two unit systems (NRBC `tys/ul` and NRBC `%`) is incorrectly deduplicated.
- `parser.ts:38–70` — `parseTrailingUnitAndRef` does not understand Diagnostyka's `Jedn. MIN MAX [FLAG]` column layout or ALAB's em-dash ref ranges. The entire `tys/ul* 4,00 10,00` token string ends up in `unit`.
- Noise rows in both fixtures pass the `LAB_ROW` regex and produce spurious items (e.g. `LUX MED SP. ZO.O. kod` → value `5`).
- Six specific rows across both fixtures contain uncorrectable OCR corruption (decimal dropped/merged, unit char misread, slash dropped). These will be skipped in tests with explanatory comments — consistent with the "test-parser-subset" policy.
- `reports.ts:19` — `buildReportSection` already uses `newItems[0]?.date ?? new Date()...`; the `??` operator handles `null` without any code change there.
- `tsconfig.json` `include: ["**/*"]` means test files are in scope for TypeScript and `eslint --project` automatically — no tsconfig changes needed.

## Desired End State

`npm test` runs Vitest in Node mode, all tests pass (0 failures), and the run covers:

1. `parseLabText` asserted against 22/28 Diagnostyka oracle items and 4/5 ALAB oracle items (remaining rows skipped with OCR-misread comments).
2. Targeted unit tests for date extraction, comma-decimal normalization, dedup, empty text.
3. `buildReportSection` and `mergeReportContent` tested for empty inputs, N-append ordering, and trailing-whitespace parity with SQL.
4. A pure `sqlAppend` helper mirroring the RPC `CASE` logic, with one documented divergence test (TS trims current content; SQL does not).
5. `LabItem.date` is `string | null`; `extractReportDate` returns `null` when no pattern matches.

## What We're NOT Doing

- CI gate (`npm test` in `.github/workflows/ci.yml`) — Phase 4.
- Integration tests (mocked Supabase, upload pipeline) — Phase 2.
- RLS / cross-tenant tests — Phase 3.
- Workers / Miniflare test pool — Phase 2+.
- Decimal-insertion heuristics for OCR misreads (Monocyty `93→9.3`, PDW `111→11.1`, etc.).
- `verify-parser.ts` oracle comparison — remains a manual dev helper; Vitest is the gate.
- `scripts/fixtures/README.md` updates — already updated by the fixture-oracle setup.
- `pgTAP` for SQL parity — pure TS helper in unit tests only.

### Addendum (2026-06-06, impl review)

`scripts/verify-parser.ts` now loads `alab-ocr.txt` (real-OCR fixture) instead of `alab-clean.txt`; `alab-clean.txt` removed. Aligns the manual dev helper with the Vitest oracle fixture — out of original scope but functionally required once tests standardized on `alab-ocr`.

## Implementation Approach

Four sequential phases: bootstrap → date API → parser fixes → test files. Each phase must pass lint and build before the next begins. Tests are written last (Phase 4) so the parser is green when test assertions are authored.

## Critical Implementation Details

**OCR-misread skip policy**: Seven oracle rows describe the true lab value, but the fixture text — the real OCR output — contains uncorrectable errors the parser cannot recover without fragile heuristics. These rows are skipped with `it.skip` (not deleted) and a comment naming the OCR artifact. Do not lower the oracle to match the parser; the oracle reflects requirements.

**Known OCR-corruption rows to skip** (verify during Phase 4 — some may auto-pass after fixes):

| Fixture | Name | Field | Fixture value | Oracle value | Corruption |
|---------|------|-------|---------------|--------------|------------|
| Diagnostyka | Monocyty % | value | `93` | `9.3` | Decimal dropped |
| Diagnostyka | Neutrofile % | refRange MAX | `700` | `70,0` | Decimal merged |
| Diagnostyka | PDW | value | `111` | `11.1` | Decimal merged |
| Diagnostyka | Niedojrzałe granulocyty IG % | unit | `Y` | `%` | Char misread |
| Diagnostyka | MCHC | refRange MIN | `310` | `31,0` | Decimal merged |
| Diagnostyka | PCT % | refRange MAX | `04` | `0,4` | Decimal dropped |
| ALAB | Kwas moczowy w surowicy | unit | `mgldL` | `mg/dL` | Slash dropped |

**Vitest alias**: use `new URL('./src/', import.meta.url).pathname` (not a bare string) for correct `@/` resolution in the test environment per Vitest docs.

**Vitest version**: install `vitest@latest`; confirm it resolves to a version compatible with the `vite ^7.3.2` override in `package.json` before committing.

---

## Phase 1: Vitest Bootstrap

### Overview

Add Vitest as a devDependency, create the minimal config, wire npm scripts, and remove the broken `debug:pdf` script. No test files yet.

### Changes Required

#### 1. `package.json`

**File**: `package.json`

**Intent**: Add `vitest` devDependency; add `"test"` and `"test:watch"` scripts; remove the broken `"debug:pdf"` entry (references `scripts/debug-pdf-parse.ts` which was deleted).

**Contract**: `devDependencies` gains `"vitest": "latest"` (run `npm install --save-dev vitest@latest` to resolve the exact version compatible with the existing Vite 7 override). Scripts section gains:
```json
"test": "vitest run --passWithNoTests",
"test:watch": "vitest"
```
and loses `"debug:pdf"`. Vitest 4 exits code 1 when no test files exist; `--passWithNoTests` is required so `npm test` exits 0 during bootstrap before Phase 4 adds test files.

#### 2. `vitest.config.ts` (new file)

**File**: `vitest.config.ts` (project root)

**Intent**: Configure Vitest to run in plain Node (no browser, no Workers), resolve `@/` to `./src/`, and only pick up files under `tests/`.

**Contract**:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
});
```

### Success Criteria

#### Automated Verification

- `npm run lint` passes with no new errors (vitest.config.ts is clean TS).
- `npm test` exits 0 with message "No test files found" or equivalent (config is valid; zero tests is acceptable at this phase).
- `npm run build` passes (package.json changes haven't broken build).

#### Manual Verification

- `npm run test:watch` starts Vitest in watch mode without error.
- `debug:pdf` script is gone from `package.json`; `npm run debug:pdf` returns "missing script" error.

**Implementation Note**: After Phase 1 automated checks pass, confirm manually that watch mode starts before moving to Phase 2.

---

## Phase 2: Parser Date API — Return null

### Overview

Change `extractReportDate` to return `string | null` (removing the `new Date()` fallback) and update `LabItem.date` accordingly. This makes "no date found in text" an explicit, testable state rather than a silent substitution.

### Changes Required

#### 1. `src/types.ts`

**File**: `src/types.ts`

**Intent**: Make `LabItem.date` nullable so callers can distinguish "date extracted from report" from "no date found".

**Contract**: Change `date: string` to `date: string | null` in the `LabItem` interface.

#### 2. `src/lib/services/parser.ts`

**File**: `src/lib/services/parser.ts`

**Intent**: Remove the `new Date()` fallback from `extractReportDate` so a no-match returns `null`. `parseLabText` already attaches `date: reportDate` to each item; with `reportDate: string | null`, items naturally get `date: null` when no date pattern matched.

**Contract**: `extractReportDate` return type changes to `string | null`. The last line `return new Date().toISOString().slice(0, 10)` becomes `return null`. No other changes in this file for this phase.

#### 3. `src/lib/services/reports.ts` — verify no change needed

**File**: `src/lib/services/reports.ts`

**Intent**: Confirm `buildReportSection` already handles `null` dates via its existing `??` operator before writing tests that depend on it.

**Contract**: `buildReportSection` line 19 is `const sectionDate = newItems[0]?.date ?? new Date().toISOString().slice(0, 10)`. Because `null ?? fallback` evaluates to `fallback`, this handles `date: null` correctly without modification. No code change; this is a verification step only.

### Success Criteria

#### Automated Verification

- `npm run lint` passes — TypeScript will catch any usages of `LabItem.date` that assumed non-null.
- `npm run build` passes — full type-check across all Astro/TS files.

#### Manual Verification

- Review any TypeScript errors surfaced by lint/build and fix them (e.g. code that assigned or compared `LabItem.date` as a non-nullable `string`).

**Implementation Note**: `uploads.ts` stores items in `ExtractionPayload.items: LabItem[]`; the `date: null` value is valid JSON/JSONB and requires no upload logic changes. The SQL RPC receives the pre-built section string, not raw items.

---

## Phase 3: Parser Bug Fixes

### Overview

Fix the four systematic bug categories so the real-OCR fixture rows (except the six known OCR-corruption rows) produce the exact values the oracle expects.

### Changes Required

All changes are in `src/lib/services/parser.ts`.

#### 1. Strip OCR artifact characters from trailing

**File**: `src/lib/services/parser.ts`

**Intent**: Before calling `parseTrailingUnitAndRef`, remove `*` and `'` characters that Diagnostyka's OCR output appends to unit tokens (e.g. `tys/ul*`, `%'*`). This prevents these artifacts from becoming part of the parsed unit string.

**Contract**: After extracting `trailing` (line 93), apply `.replace(/[*']/g, "").trim()` before passing to `parseTrailingUnitAndRef`. The stripped trailing is used for unit/ref parsing only; the original match is not stored.

#### 2. Diagnostyka `<unit> <MIN> <MAX> [FLAG]?` → refRange

**File**: `src/lib/services/parser.ts`

**Intent**: Diagnostyka lab rows use space-separated MIN and MAX columns (not a hyphenated range), optionally followed by a flag token (`L`, `H`, `(H`). The current `parseTrailingUnitAndRef` does not recognise this layout; the entire `tys/ul 4,00 10,00` string ends up as `unit`. Fix this by detecting the `<unit> <MIN> <MAX>` pattern and assembling `MIN-MAX` as the refRange.

**Contract**: Add a branch in `parseTrailingUnitAndRef` (before the existing fallback `return { unit: trimmed }`) that matches:
```
/^(\S+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s*(?:\(?[LH]\)?)?$/
```
When matched: `unit` = first capture, `refRange` = `${second}-${third}` (hyphen-joined, comma decimals preserved to match oracle format). Flag token is discarded. This branch runs only after the existing `<>≤≥` and hyphenated-range branches, so it does not interfere with formats those branches already handle.

#### 3. ALAB em-dash ref ranges

**File**: `src/lib/services/parser.ts`

**Intent**: ALAB rows use em-dash `—` (U+2014) as the range separator with surrounding spaces (e.g. `136 — 145`). The existing `rangeMatch` regex includes only hyphen `-` (U+002D) and en-dash `–` (U+2013). Extend the delimiter character class to include em-dash and strip surrounding whitespace when building the refRange value.

**Contract**: In the `rangeMatch` regex (line 56), change `[-–]` to `[-–—]`. When building `refRange` from `rangeMatch[1]`, normalize spaces around the separator: replace `\s*[–—]\s*` with `—` and `\s*-\s*` with `-` so the output matches oracle format (e.g. `"136—145"` not `"136 — 145"`). The existing `.replace(/\s+/g, "")` already strips all whitespace — verify it preserves em-dash correctly, or adjust to `replace(/\s/g, "")`.

#### 4. Noise row denylist

**File**: `src/lib/services/parser.ts`

**Intent**: Header, footer, address, and methodology lines in both Diagnostyka and ALAB OCR exports pass the `LAB_ROW` regex and produce spurious items. Filter them before the regex match.

**Contract**: Add a pre-regex check inside the line loop. Skip the current line if it matches any of these patterns (check after normalizing whitespace):

- Contains `Sp. z` or `ZO.O.` or `S.A.` — company form suffixes
- Starts with `Badanie wykonano` — methodology note lines
- Starts with `temp.` — temperature range footer lines
- Starts with `Autoryzow` — authorization lines

This denylist is tuned to the two current fixtures. The implementer should run `npm run verify:parser` after applying it, confirm spurious items are gone, and add any remaining noise patterns encountered.

#### 5. Dedup key includes unit

**File**: `src/lib/services/parser.ts`

**Intent**: The current dedup key `${name}:${value}` drops the second NRBC row because both have the same name and value (`0.00`) but different units (`tys/ul` and `%`). These are distinct analytes and must both be kept.

**Contract**: Change line 96 from:
```typescript
const key = `${name}:${value}`;
```
to:
```typescript
const key = `${name}:${value}:${unit ?? ""}`;
```

### Success Criteria

#### Automated Verification

- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification

- `npm run verify:parser` runs without error and outputs JSON for both fixtures.
- Visual inspection of the output shows the NRBC rows (both `tys/ul` and `%`) appear in the Diagnostyka output.
- No company-header or methodology lines appear in either fixture's output.
- Unit and refRange fields are populated for all tys/ul rows in Diagnostyka output.

**Implementation Note**: Run `verify:parser` before and after each sub-fix to confirm incremental progress. The dedup fix (item 5) should be applied last so the NRBC pair is visible in the output once unit/ref parsing is correct.

---

## Phase 4: Test Files

### Overview

Write `tests/unit/parser.test.ts` and `tests/unit/reports.test.ts`, import from Vitest directly (no globals config needed), and run `npm test` to confirm 0 failures.

### Changes Required

#### 1. `tests/unit/parser.test.ts` (new file)

**File**: `tests/unit/parser.test.ts`

**Intent**: Assert `parseLabText` output against real-OCR golden oracles for both providers, plus targeted unit tests for each contract point in the parser.

**Contract**:

Imports at the top:
```typescript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLabText } from "@/lib/services/parser";
```

Fixture loader pattern (use `resolve` from the project root):
```typescript
const fixturesDir = resolve(process.cwd(), "scripts/fixtures");
function loadFixture(name: string) {
  const text = readFileSync(resolve(fixturesDir, `${name}.txt`), "utf-8");
  const expected = JSON.parse(
    readFileSync(resolve(fixturesDir, `${name}.expected.json`), "utf-8"),
  ) as { items: unknown[] };
  return { text, expectedItems: expected.items };
}
```

**Fixture-oracle test — Diagnostyka** (`describe("diagnostyka-ocr fixture")`):

Assert `parseLabText(text)` deep-equals oracle `items` for each item that is NOT in the OCR-misread skip list. The recommended pattern is to filter the oracle array and assert the filtered result:

```typescript
// OCR-corruption rows that cannot be recovered without decimal-insertion heuristics.
// Skip rather than lower the oracle. Un-skip when OCR quality improves.
const DIAG_OCR_SKIP_NAMES_UNITS: Array<[string, string | undefined]> = [
  ["Monocyty", "%"],              // value 93 in fixture; oracle 9.3 (decimal dropped)
  ["Neutrofile", "%"],            // refRange MAX 700 in fixture; oracle 70,0 (decimal merged)
  ["PDW", "fl"],                  // value 111 in fixture; oracle 11.1 (decimal merged)
  ["Niedojrzałe granulocyty IG", "%"], // unit Y in fixture; oracle % (char misread)
  ["MCHC", "g/dl"],              // refRange MIN 310 in fixture; oracle 31,0 (decimal merged)
  ["PCT", "%"],                  // refRange MAX 04 in fixture; oracle 0,4 (decimal dropped)
];
```

Assert that the non-skipped oracle items appear in the parser output (strict deep-equal subset check). Parser still emits rows for OCR-corrupted lines (with wrong field values); assert `parseLabText(text)` length equals oracle item count (28) and 22/28 items deep-equal the oracle.

**Fixture-oracle test — ALAB** (`describe("alab-ocr fixture")`):

Skip rows with OCR corruption:
```typescript
// unit mgldL in fixture; oracle mg/dL (slash dropped by OCR)
// Skip "Kwas moczowy w surowicy (M45)" with unit "mg/dL".
```

Assert 4/5 oracle items are present in parser output.

**Targeted unit tests** (`describe("parseLabText unit tests")`):

- `"labeled date wins over generic date"` — text with `data wykonania: 15.03.2024` and another date earlier in text; result items all have `date: "2024-03-15"`.
- `"first plain date used when no label"` — text with no label but a `DD.MM.YYYY` date somewhere; result items have that date.
- `"returns null date when no date pattern matches"` — text with no date; result items have `date: null`.
- `"comma decimal normalized to dot"` — item with value `6,21`; result value is `"6.21"`.
- `"empty text returns empty array"` — `parseLabText("") === []`.
- `"line shorter than 4 chars is skipped"` — text with only a 3-char line; returns `[]`.
- `"same name different unit both kept"` — text with two NRBC rows differing only in unit; both items appear in result.

#### 2. `tests/unit/reports.test.ts` (new file)

**File**: `tests/unit/reports.test.ts`

**Intent**: Assert `buildReportSection` and `mergeReportContent` behavior covering empty inputs, N-append ordering, and the TS-vs-SQL trim divergence. Include a pure `sqlAppend` helper that mirrors the RPC `CASE` logic.

**Contract**:

Imports:
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildReportSection, mergeReportContent } from "@/lib/services/reports";
import type { LabItem } from "@/types";
```

Helper:
```typescript
/** Mirror of the SQL append CASE in complete_upload_processing_rpc.sql lines 43–46. */
function sqlAppend(current: string, section: string): string {
  return current.trim() === "" ? section : `${current}\n\n${section}`;
}

const ITEM: LabItem = { name: "CRP", value: "1.0", unit: "mg/L", refRange: "<5", date: "2024-01-01" };
```

**`buildReportSection` tests** (`describe("buildReportSection")`):

- `"empty items → empty string"` — `buildReportSection([]) === ""`.
- `"single item → section with ## heading and table row"` — result contains `## 2024-01-01`, `| CRP |`, `| 1.0 |`.
- `"uses today when date is null"` — `vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-15")); buildReportSection([{ ...ITEM, date: null }])` contains `## 2026-01-15`. Restore timers in `afterEach`.

**`mergeReportContent` tests** (`describe("mergeReportContent")`):

- `"empty current + items → section only"` — `mergeReportContent("", [ITEM])` equals `buildReportSection([ITEM])`.
- `"non-empty current + items → trimmed current + \\n\\n + section"` — `mergeReportContent("## 2023-01-01\n...\n", [ITEM])` starts with `## 2023-01-01` and contains `\n\n## 2024-01-01`.
- `"two merges → two sections in order"` — merge item A into empty, then item B into result; final string contains `## dateA` before `## dateB`.
- `"empty items → returns current unchanged"` — `mergeReportContent("existing", []) === "existing"`.

**SQL parity tests** (`describe("SQL append parity")`):

- `"empty current: TS and SQL agree"` — `mergeReportContent("", [ITEM]) === sqlAppend("", buildReportSection([ITEM]))`.
- `"non-empty current: TS and SQL agree"` — same assertion with a non-empty current string (no trailing whitespace).
- `"trailing whitespace: TS trims, SQL does not — known divergence"` — current has trailing `\n`. TS result (`mergeReportContent`) starts from trimmed content. SQL result (`sqlAppend`) appends to untrimmed content. Assert they are NOT equal and add a comment:
  ```typescript
  // Known parity gap: mergeReportContent trims currentContent before appending;
  // the SQL RPC appends to the untrimmed stored content. This divergence is
  // benign in practice (SQL content is written by the RPC, not by TS), but
  // worth tracking explicitly. Fix if production content ever has trailing whitespace.
  expect(mergeReportContent(currentWithTrailing, [ITEM])).not.toBe(
    sqlAppend(currentWithTrailing, buildReportSection([ITEM])),
  );
  ```

### Success Criteria

#### Automated Verification

- `npm test` exits 0 — all tests pass, no unexpected failures.
- `npm run lint` passes on the new test files.
- `npm run build` passes.

#### Manual Verification

- `npm run verify:parser` still runs and prints JSON (smoke check no import regressions).
- Skipped tests are visible in the Vitest output as "skipped" (not silently absent).
- The SQL parity divergence test is intentionally asserting `not.toBe` — confirm this is the only test doing so.

**Implementation Note**: If additional fixture rows fail unexpectedly during Phase 4 (beyond the seven listed in the skip table), add them to the skip list with a comment identifying the OCR artifact. Do not silently exclude them — the `it.skip` record is important for future work.

---

## Testing Strategy

### Unit Tests

- `parseLabText` — date extraction (all four patterns + null), comma-decimal, short-line filter, dedup by name+value+unit, empty text.
- Fixture-oracle tests — both providers; skipped rows documented with OCR artifact description.
- `buildReportSection` — empty, single item, null-date fallback (mocked clock).
- `mergeReportContent` — empty current, non-empty current, two-append ordering, empty items no-op.

### Integration Tests

Deferred to Phase 2 of the test-plan rollout (upload pipeline, mocked Supabase).

### Manual Testing Steps

1. `npm test` — confirm 0 failures, note any `skipped` count.
2. `npm run verify:parser` — confirm both fixtures still print output, NRBC pair visible in Diagnostyka output.
3. `npm run lint && npm run build` — confirm no type regressions from the `date: string | null` change.

## Migration Notes

`LabItem.date` changes from `string` to `string | null`. Any callsite that assumed `date` is always a non-null string must handle `null`. In the current codebase, only `buildReportSection` (already handled via `??`) and the Supabase JSONB payload in `uploads.ts` are affected — `null` is a valid JSONB value and requires no migration.

## References

- Research doc: `context/changes/testing-critical-path-pure-logic/research.md`
- Test plan (Phase 1): `context/foundation/test-plan.md`
- Parser entry point: `src/lib/services/parser.ts:75-112`
- Merge functions: `src/lib/services/reports.ts:14-32`
- SQL append logic: `supabase/migrations/20260602120000_complete_upload_processing_rpc.sql:43-46`
- Fixture loader reference: `scripts/verify-parser.ts:17-20`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Vitest Bootstrap

#### Automated

- [x] 1.1 `npm run lint` passes with no new errors — 67d6cdc
- [x] 1.2 `npm test` exits 0 (zero-tests config is valid) — 67d6cdc
- [x] 1.3 `npm run build` passes — 67d6cdc

#### Manual

- [x] 1.4 `npm run test:watch` starts Vitest in watch mode without error — 67d6cdc
- [x] 1.5 `npm run debug:pdf` returns "missing script" error (removed) — 67d6cdc

### Phase 2: Parser Date API — Return null

#### Automated

- [x] 2.1 `npm run lint` passes (no `string | null` type errors) — 43d7cb1
- [x] 2.2 `npm run build` passes — 43d7cb1

#### Manual

- [x] 2.3 Any TS errors from `date: string | null` change reviewed and fixed — 43d7cb1

### Phase 3: Parser Bug Fixes

#### Automated

- [x] 3.1 `npm run lint` passes — 7e41523
- [x] 3.2 `npm run build` passes — 7e41523

#### Manual

- [x] 3.3 `npm run verify:parser` runs and shows NRBC pair in Diagnostyka output — 7e41523
- [x] 3.4 No company-header or methodology lines in either fixture's output — 7e41523
- [x] 3.5 Unit and refRange fields populated for `tys/ul` rows in Diagnostyka output — 7e41523

### Phase 4: Test Files

#### Automated

- [x] 4.1 `npm test` exits 0 — all tests pass — ac3eeba
- [x] 4.2 `npm run lint` passes on test files — ac3eeba
- [x] 4.3 `npm run build` passes — ac3eeba

#### Manual

- [x] 4.4 `npm run verify:parser` still runs (smoke check no import regressions) — ac3eeba
- [x] 4.5 Skipped tests visible in Vitest output as "skipped", not silently absent — ac3eeba
- [x] 4.6 SQL parity divergence test is the only `not.toBe` assertion in `reports.test.ts` — ac3eeba
