# Frame Brief: PDF Text Extraction Blocker in S-01

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Phases 0, 1, and partial Phase 2 of S-01 are implemented. The Diagnostyka PDFs
have selectable text in the viewer, but `unpdf` extraction produces garbled
output in `extracted.txt` (2,236 lines of raw glyph IDs / control characters,
zero readable Polish text). Implementation is stuck at the extraction step.

## Initial Framing (preserved)

- **User's stated cause or approach**: The `unpdf` *implementation call* is wrong — the research.md was updated with Context7 API docs to verify correct usage before re-implementing.
- **User's proposed direction**: Re-frame the whole approach to confirm it's still valid, then write a new `plan.md`.
- **Pre-dispatch narrowing**: Single leading concern — garbled extraction despite "selectable" PDF text. Phases 0–1 done, Phase 2 stuck on extraction.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Custom font encoding / missing ToUnicode CMap** — PDF uses glyph IDs not
   mapped to Unicode; viewer renders glyphs visually but byte stream encodes
   private indices. Extraction returns raw indices = unreadable.
2. **Wrong `unpdf` API call** ← user's initial framing — passing Buffer instead of
   Uint8Array, wrong options, skipping `getDocumentProxy`, etc.
3. **Node vs workerd environment difference** — debug script (Node/tsx) vs Worker
   runtime behave differently for the serverless PDF.js build.
4. **Output write encoding** — `debug-pdf-parse.ts` writes extracted bytes as JSON /
   binary blob rather than UTF-8 text, making file look garbled even if extraction
   was correct.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| **Dim 1: ToUnicode CMap missing** | `extracted.txt:1` — leading bytes 0x04–0x1F (raw glyph IDs); `:8`,`:14` — lines begin with `!"` (glyph slot 0x21+); `:54` — `"# $%&` sequence. Zero Polish/Latin words in 2,236 lines. **Copy-paste from PDF viewer also garbled** (user confirmed). | **STRONG** |
| **Dim 2: Wrong `unpdf` API call** | No `scripts/debug-pdf-parse.ts` in repo (`package.json:16` points at missing file). No `unpdf` call sites in `src/`. Spike was run outside repo — call pattern cannot be inspected. | **NONE** (unverifiable, not the root) |
| **Dim 3: Node vs workerd** | No Worker upload code exists yet; moot until Phase 2 implementation. | **NONE** (N/A at this stage) |
| **Dim 4: Output write encoding** | `extracted.txt` is plain newline-delimited text with control chars *in content* (not JSON/Buffer artifacts). No `{type:"Buffer"}` or base64. Write format is fine; content is the problem. | **NONE** (evidence against) |

## Narrowing Signals

- Copy-paste from PDF viewer → also garbled. This is the decisive signal: if the
  viewer's copy mechanism can't recover Unicode text, the encoding is not in the
  PDF byte stream at all. `unpdf` cannot be "fixed" to extract what isn't there.
- `extracted.txt` has 2,236 lines of output — extraction ran completely, produced
  volume, but with raw glyph IDs throughout. Not a crash, not empty — a successful
  run on unrecoverable source material.
- `scripts/debug-pdf-parse.ts` is absent: spike was run ad-hoc, outside version
  control. API call details unknown, but irrelevant given Dim 1 confirmation.

## Cross-System Convention

"Selectable text PDF = extractable Unicode text" is a common but incorrect
assumption. PDF viewers render glyphs by shape (font outlines); they do not
require ToUnicode mappings to display text correctly. Text *extraction* tools
(pdf.js, pdfminer, etc.) require a ToUnicode CMap to convert glyph IDs to
Unicode codepoints. Lab management software (e.g. Diagnostyka's system) often
embeds fonts with custom encoding tables and no ToUnicode CMap — a well-known
issue with Polish and other Eastern-European lab PDFs.

The research.md framed the risk as *"Diagnostyka layout/parser, not the PDF
library"* (`research.md:122`). That framing was made before the spike. The spike
disproves it: the blocker is one level deeper than parser layout.

## Reframed Problem Statement

> **The actual problem to plan around is**: The specific Diagnostyka PDF samples
> used do not contain recoverable Unicode text — they use a custom font encoding
> without a ToUnicode CMap, making standard text extraction return raw glyph IDs
> regardless of implementation correctness.

The Phase 0 spike succeeded technically (extraction ran, produced output) but
revealed that the foundational assumption for S-01 — "pre-anonymized PDFs with
selectable text → extractable text pipeline via `unpdf`" — does not hold for the
user's actual Diagnostyka files. Fixing the `unpdf` call will not resolve this.
The plan must now answer: **is there a method that can recover readable text from
these PDFs, and does it work within the Worker/edge constraints?**

## Confidence

**HIGH** — STRONG evidence + copy-paste confirmation (decisive) + cross-system
convention match + no competing hypothesis has any evidence.

## What Changes for /10x-plan

The new plan's central question is no longer *"how do I implement the extraction
pipeline"* — it is *"can readable text be recovered from these Diagnostyka PDFs
at all, and via which method?"* Phase 0 must be restructured as an explicit
**extraction feasibility investigation** with three concrete paths to evaluate
before any pipeline code is written:

1. **CMap injection** — supply `cMapUrl` / `cMapPacked` to `getDocumentProxy`;
   requires knowing which CMap the Diagnostyka fonts need. Stays within Workers.
2. **Client-side extraction** — use full `pdfjs-dist` in the browser (with CMap
   support) before upload; send extracted text to the API. Changes architecture
   (text travels over the network, not just the PDF file).
3. **OCR fallback** — render pages as images and run OCR. `renderPageAsImage`
   is Node/browser only; requires off-Worker preprocessing step or external
   service — conflicts with current sync-in-Worker architecture and PRD's
   "no external services" scope.

If none of the three paths yields readable Polish text from the actual files,
S-01's PDF scope must be revisited (e.g., limit to PDFs where copy-paste is
readable, or defer Diagnostyka support to a later change).

## References

- `extracted.txt` (repo root, untracked) — spike output
- `package.json:16` — `debug:pdf` → missing `scripts/debug-pdf-parse.ts`
- `context/changes/first-pdf-to-report/research.md:122` — "layout/parser risk,
  not the library" (framing now superseded by spike evidence)
- `context/changes/first-pdf-to-report/research.md:332` — open question on
  `extracted.txt` and spike status (now answered)
- `node_modules/unpdf/README.md:29–40` — `getDocumentProxy` / `Uint8Array`
  canonical usage
- Investigation tasks: a335c352 (Dim 2), 71faea05 (Dim 1 + Dim 4)

---

# Frame Brief II: "Is there a safe non-OCR recovery method?" (2026-06-01)

> Second framing pass. Premise = Frame Brief I's HIGH-confidence finding: the
> readable text is **not in the byte stream** (viewer copy-paste is garbled).
> This pass challenges the *next* framing — "find a safe method other than OCR."

## Reported Observation

Blocked: the PDFs carry no recoverable Unicode and can't be parsed the typical
way. Need to rethink the approach. It "must be safe." Looking for a recovery
method **other than OCR**.

## Initial Framing (preserved)

- **User's stated cause**: standard extraction can't work; the approach itself
  must change.
- **User's proposed direction**: find a *safe* recovery method that is *not* OCR.
- **Clarifications captured this pass**:
  - "Safe" = **privacy**. These are the user's own records; they don't want them
    leaving their control. (Not a correctness concern — user controls input
    quality. User already imagined *local redaction → send de-identified text
    for parsing*.)
  - **Input is malleable**: "I could convert the input PDF into another format."
  - **Scope**: Diagnostyka is crucial; similar no-Unicode issues are expected at
    other providers (general problem, not a one-file fluke).

## Dimension Map — where can readable text actually come from?

Given the text exists only as *rendered glyph shapes* (not Unicode bytes), there
are only three possible **sources of truth** for the text:

1. **Reverse-engineer the font's glyph map** — reconstruct a GID→Unicode table
   per font, patch a ToUnicode CMap, then extract from the byte stream. (Non-OCR,
   byte-stream.)
2. **Read the rendered pixels** — rasterize the page and recognize the glyphs
   visually. (This *is* OCR, by definition — regardless of where it runs.)
3. **Obtain a different artifact that already carries Unicode** — a cleaner
   export from Diagnostyka's portal, or structured data (FHIR/CDA), or manual
   paste/typing. (Non-OCR, but changes the *input*, not the extraction.)

"Convert the PDF to another format" is **not a fourth source** — converting a
no-ToUnicode PDF to PDF/text/Word cannot manufacture Unicode that was never
encoded. Such a conversion only yields readable text if it (a) routes through
OCR, or (b) pulls from a different source. So it collapses into Dim 2 or Dim 3.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| **Dim 1: reverse-engineer glyph map (non-OCR, automated)** | Tools exist (`pdf-cmap-fix`, `shreevatsa/pdf-glyph-mapping`, manual PyMuPDF ToUnicode patching) but require a **known per-font GID→Unicode lookup** or **manual glyph-by-glyph mapping by eye / bitmap comparison**. For subset fonts with sequential custom char codes (the Diagnostyka shape), spec experts state it is "simply not possible to determine the Unicode values" automatically. Per-font, brittle, **does not generalize** to other providers, and any auto-guess is a silent-correctness risk on lab numbers. | **WEAK** — possible in theory, not a safe/general automated pipeline |
| **Dim 2: OCR — but the "unsafe" premise is FALSE** | Tesseract.js / Transformers.js (TrOCR) run **fully client-side via WASM/WebGPU; data never leaves the browser**. Explicitly recommended for "privacy-sensitive documents (medical, legal)". Polish supported (`pol.traineddata`). Pipeline: pdf.js → canvas → local OCR → text. | **STRONG** — only robust, generalizable automated path; and it satisfies "safe = privacy" |
| **Dim 3: change the input source (non-OCR)** | Diagnostyka runs a Patient Portal ("Wyniki on-line"/CSWL); PL ecosystem has HL7 FHIR / CDA lab-result standards + e-Zdrowie P1. **But**: P1/FHIR access is institutional, not a patient-facing API; portal export availability/format is unverified. A portal **HTML view that copy-pastes cleanly** would be the cheapest non-OCR win — but the user must check whether it exists. | **MEDIUM** — genuine non-OCR path, availability unverified, may not generalize |

## Narrowing Signals

- **The premise behind the question is the bug.** "Safe" was assumed to exclude
  OCR; user clarified "safe" = privacy. Client-side OCR is private. So the
  framing "safe **or** OCR" is a **false dilemma** — local OCR is **both**.
- Text lives only as glyph shapes ⇒ any *automated, generalizable* recovery from
  these (and "similar other providers") is visual recognition = OCR. Non-OCR
  options either require per-font manual reverse-engineering (Dim 1, unsafe for
  correctness, doesn't scale) or a different input source (Dim 3, may not exist).
- "Convert to another format" does not bypass OCR; it routes through it or
  through a new source. Worth stating explicitly so it isn't treated as a free
  fix.

## Cross-System Convention

Privacy-first **client-side OCR** is an established pattern for exactly this
problem class (sensitive PDFs whose text layer is missing/garbled): render with
pdf.js, recognize with WASM OCR in a Web Worker, nothing uploaded. "OCR" in
public discourse is conflated with "cloud OCR API" — but the local-WASM variant
removes the third-party trust problem entirely. The project already extracts in
the browser (`PdfExtractor.ts` runs pdfjs client-side), so a local-OCR fallback
fits the existing architecture rather than fighting it.

## Reframed Problem Statement

> **The actual problem to plan around is not "OCR vs a safe alternative." It is:
> (a) WHERE does the readable text come from — re-acquire a Unicode-bearing input,
> or recognize the rendered pixels — and (b) WHERE does recognition run.** The
> privacy requirement is a *deployment constraint* (keep processing on the
> client), not a reason to rule OCR out. Local/in-browser OCR is the only
> robust, generalizable, privacy-preserving automated path for these files; the
> only non-OCR alternative that doesn't rely on brittle per-font reverse-
> engineering is changing the input source (Diagnostyka portal export / manual
> paste), whose availability is unverified.

The user's instinct ("must be safe, not OCR") rests on a false equivalence
between OCR and data-sharing. Removing that, the real fork is a **product/UX
decision** among: client-side OCR (general, private, accuracy-review needed),
re-acquire input (non-OCR, depends on Diagnostyka), or manual paste (trivial,
poor UX).

## Confidence

**HIGH** — the false-dilemma finding is decisive (local OCR is private, verified
across multiple independent sources), and the "text only exists as glyphs ⇒ OCR
is the general automated path" follows directly from Frame Brief I's HIGH-
confidence root cause. MEDIUM only on Dim 3 *availability* (portal export format
unverified — user can check in minutes).

## What Changes for /10x-plan

The plan should stop searching for a "non-OCR extraction" and instead **decide
between two product directions**, then plan the chosen one:

1. **Client-side OCR fallback** — pdf.js render → canvas → Tesseract.js (`pol`)
   in a Web Worker → text → existing readability heuristic → de-identify →
   pipeline. All on-device. Plan must cover: model/asset hosting (local vs CDN),
   accuracy on lab tables/numbers, and a **mandatory user-review/confirm step**
   before values are trusted (mitigates the one real risk — silent mis-reads).
2. **Re-acquire Unicode input** — first verify whether Diagnostyka's "Wyniki
   on-line" portal offers an HTML/export that copy-pastes cleanly (cheap test:
   paste into `/dev/pdf-extract` or a textarea). If yes, a paste/import flow
   avoids OCR entirely. If no, fall back to (1).

Recommended pre-plan action (≤30 min, user-only): open the Diagnostyka portal,
try copy-paste from the on-line result view (not the PDF). The answer decides
whether direction 2 is even on the table.

## Decisive Narrowing Signal (user, 2026-06-01)

User tested copy-paste across providers:

| Provider | Viewer copy-paste | Path |
| --- | --- | --- |
| **Diagnostyka** | ✗ garbled / no text | **OCR fallback required** |
| **ALAB** | ✓ readable | byte-stream extraction works |
| **Enel Med** | ✓ readable | byte-stream extraction works |

Diagnostyka was the worst-case sample, **not** representative of all providers.
Decision: **fall back to OCR for Diagnostyka**, keep byte-stream extraction for
the rest. This confirms a **two-tier pipeline**, not an OCR rewrite:

- **Tier 1 (primary):** existing `PdfExtractor.ts` (pdfjs client-side) → if
  `isReadableExtractedText()` passes (ALAB, Enel Med, most providers), use it.
- **Tier 2 (fallback):** on `GARBLED` (Diagnostyka), render pages → client-side
  OCR (Tesseract.js `pol`) → re-run readability gate → de-identify → pipeline.

The existing `ExtractionError("GARBLED", …)` is already the natural trigger
point for the fallback — minimal architectural change.

## References

- Frame Brief I (above) — root cause: no recoverable Unicode in byte stream.
- `src/components/upload/PdfExtractor.ts` — existing client-side pdfjs extraction
  + `isReadableExtractedText` heuristic (reusable as OCR gate).
- Web: Tesseract.js local/WASM OCR, privacy-first, Polish (`pol.traineddata`);
  `qduc/ocr`, naptha/tesseract.js local-installation docs.
- Web: `pdf-cmap-fix`, `shreevatsa/pdf-glyph-mapping`, PyMuPDF #530 — non-OCR
  glyph-map reconstruction (manual/per-font; StackOverflow 79560847 — subset
  fonts often unrecoverable without manual work).
- Web: Diagnostyka "Wyniki on-line"/CSWL portal; PL HL7 FHIR / CDA
  `plCdaLabReportSection`; e-Zdrowie P1 EPP REST API (institutional access).
