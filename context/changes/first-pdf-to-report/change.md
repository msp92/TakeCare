---
change_id: first-pdf-to-report
title: First PDF to report
status: implemented
created: 2026-05-28
updated: 2026-06-02
triage_completed: 2026-06-01
framed: 2026-06-01
reframed: 2026-06-01
archived_at: null
---

## Notes

### Unblocked via OCR reframe (2026-06-01)

**Supersedes the "blocked / product decision" notes below.** Frame Brief II (`frame.md`)
resolved the extraction blocker: the chosen direction is a **two-tier client-side
pipeline** — Tier-1 byte-stream extraction (ALAB/Enel Med) with a **local in-browser OCR
fallback** (Tesseract.js `pol`) for Diagnostyka, plus a mandatory OCR review step. Local
OCR keeps data on-device, so it satisfies the privacy requirement; "OCR = data sharing"
was a false dilemma. The "Product options (pick one)" block and the "Change blocked" status
below are **historical** — the plan (`plan.md`) implements the OCR direction. Proceed with
`/10x-implement`.

### Phase 1 extraction probe (2026-06-01)

**Fixture:** `C:\Users\Maciek\Documents\Badanie_lekarskie_586532590_2_anon.pdf` via `PROBE_PDF`.

| Probe | Result |
| --- | --- |
| probe-1 (unpdf defaults) | 2 249 chars extracted; **garbled** (glyph IDs / control chars, no readable Polish) |
| probe-2 (unpdf + local CMap) | Error: `Cannot transfer object of unsupported type` |
| probe-3 (unpdf text items + CMap) | Same error |
| probe-4 (pdfjs-dist legacy + local CMap) | Same error |

**Conclusion:** Phase **1a did not pass** on this file — no probe produced readable Polish text. Server-side CMap injection could not be validated in Node/tsx (probe infrastructure error, not proof that browser CMap fails). Aligns with `frame.md` (missing ToUnicode CMap).

**Phase 1 manual (1.3):** Confirmed — no probe output contains readable Polish text.

### Phase 1b browser probe (2026-06-01)

**Fixture:** same Diagnostyka PDF on `/dev/pdf-extract`.

**Result:** `extractPdfText()` runs (pdfjs-dist + CDN CMaps + worker). Extraction completes but fails **`GARBLED`** — same class of output as probe-1 (glyph IDs, not readable Polish).

**Conclusion:** **Neither 1a nor 1b passes** on this file. Matches `frame.md` HIGH-confidence finding: PDF lacks recoverable Unicode (no ToUnicode CMap; viewer copy-paste also garbled). Standard pdf.js CMaps do not decode Diagnostyka’s custom font encoding.

**Status:** Change **blocked** until product decision (see options below). Do **not** implement Phases 2–6 against this PDF type without a new extraction strategy.

### Deferred: Upload API contract (1b — only if a future PDF fixture passes 1b)

| Field | Required | Notes |
| --- | --- | --- |
| `file` | yes | `application/pdf`, ≤ 2 pages, ≤ 20 MB |
| `extracted_text` | yes | Output of `extractPdfText(file)` |

### Product options (pick one before unblocking)

1. **Different PDF source** — Export from Diagnostyka (or another lab) where copy-paste from the viewer yields readable Polish; re-run `/dev/pdf-extract` as gate.
2. **Narrow MVP scope** — Ship S-01 for “Unicode-extractable” PDFs only; document Diagnostyka custom-encoding PDFs as unsupported in v1.
3. **OCR path** — Out of current PRD/plan (external service or off-Worker preprocessing); new change + frame.
4. **Manual paste workflow** — User pastes text from another source; no PDF extraction (scope change).

**Dev probe (still useful for future fixtures):** `npm run dev` → `/dev/pdf-extract`.

### Magic Link callback (2026-06-01)

**Handler:** `src/lib/auth/handleAuthCallback.ts` + `GET /auth/callback` (`src/pages/auth/callback.ts`).

**Branches implemented:** `?code=` → `exchangeCodeForSession` (PKCE); `token_hash` + `type` → `verifyOtp` (cross-device).

**Local spike (required):** Send Magic Link via `/auth/signin`, open Inbucket (`http://127.0.0.1:54324`), inspect the link query params, and record which branch your Supabase template uses here after testing.

### Phase 1 two-tier extraction — manual pass (2026-06-01)

**Fixture:** ALAB/Enel Med PDFs + Diagnostyka PDF on `/dev/pdf-extract`.

| Provider | Tier | Result |
| --- | --- | --- |
| ALAB / Enel Med | Tier 1 (`text`) | Readable preview (~500 chars), `readable = yes` |
| Diagnostyka | Tier 2 (`ocr`) | OCR completes after non-SIMD `tesseract-core-lstm` core fix; readable Polish lab text |

**Fixes applied during manual:** pdf.js legacy build + bundled worker; Tesseract non-SIMD LSTM core (`tesseract-core-lstm.wasm.js?url`) to avoid `DotProductSSE` abort in embedded Chromium.

**Worker cleanup:** Repeated uploads on probe do not leak workers (terminate in `finally`).
