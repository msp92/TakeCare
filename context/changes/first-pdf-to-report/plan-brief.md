# First PDF to Report — Plan Brief

> Full plan: `context/changes/first-pdf-to-report/plan.md`
> Frame brief: `context/changes/first-pdf-to-report/frame.md`
> Research: `context/changes/first-pdf-to-report/research.md`

## What & Why

Deliver S-01's north-star journey (Magic Link sign-in → upload a ≤2-page lab PDF →
longitudinal Markdown report), unblocked by a **two-tier client-side extraction
pipeline**. The blocker: Diagnostyka PDFs carry no recoverable Unicode — the readable
text exists only as rendered glyph shapes — so standard extraction (and viewer
copy-paste) returns garbled glyph IDs. The fix recovers text by reading the rendered
pixels with **on-device OCR**, which keeps the user's medical records private.

## Starting Point

F-01 (tables, RLS, private Storage bucket) is complete. A client-side Tier-1 extractor
(`PdfExtractor.ts`, pdfjs + readability gate) already exists and works for ALAB and Enel
Med, but throws `GARBLED` on Diagnostyka. Auth is still email/password; there is no
upload UI/API, no service layer, and no report view.

## Desired End State

A user signs in via Magic Link and uploads a PDF. Clean PDFs (ALAB/Enel Med) are
extracted instantly; Diagnostyka transparently falls back to local OCR, then asks the
user to review/correct the read values before saving. The dashboard shows a merged,
escaped Markdown report and an upload history; data persists across sessions.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Recovery method for no-Unicode PDFs | On-device OCR (visual recognition) | Text exists only as glyphs; OCR is the only robust, generalizable automated recovery | Frame |
| Where OCR runs | Client-side (browser) | Privacy ("data never leaves device") + avoids Cloudflare Workers CPU limits | Frame |
| Pipeline shape | Two-tier: text extraction → OCR fallback | Most providers copy-paste cleanly; only Diagnostyka-class PDFs pay the OCR cost | Frame |
| OCR engine | Tesseract.js (WASM, `pol`) | Smallest footprint, mature on printed text, integrates with existing pdfjs render | Plan |
| OCR asset delivery | CDN (jsDelivr) + IndexedDB cache | Zero bundle/hosting weight; PDF data never goes to the CDN, only static models | Plan |
| Number-accuracy guard | Mandatory review/edit step on OCR path only | Eliminates silent mis-reads where the risk is real; clean path stays frictionless | Plan |
| Scope | Full S-01, extraction tier rewritten | One coherent plan; Phases 2–6 already exist and carry over | Plan |

## Scope

**In scope:** two-tier extraction (Tier-1 reuse + Tier-2 Tesseract.js OCR fallback + source
tagging); mandatory OCR review step; Magic Link auth; types + service layer; upload
page/API; report dashboard; DELETE RLS migration.

**Out of scope:** server/Worker-side OCR or PDF rendering; cloud OCR or redact-then-LLM
parsing (separate change); auto-anonymization (Presidio); multiple facility templates;
async queues; full delete UX; confidence-based auto-accept of OCR values.

## Architecture / Approach

Extraction is client-side and two-tier. The browser runs Tier 1 (`pdfjs-dist`
`getTextContent` + readability gate); on `GARBLED`/`EMPTY` it dynamically loads the OCR
module, renders each page to a canvas at ~2.5× and runs Tesseract.js (`pol`) in a Web
Worker, then re-gates the text. The result carries `source: "text" | "ocr"`. The upload
form submits `file` + `extracted_text` + `source`; OCR results require human review before
submission. The server stores the PDF, parses the client-supplied text deterministically,
and merges the single per-user report row.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Two-tier extraction | Tier-1 reuse + local OCR fallback + source tag; dev probe | OCR accuracy on lab numbers (mitigated by 2.5× render + review) |
| 2. Magic Link auth | OTP sign-in, `/auth/callback`, signup removed | Redirect URL allow-listing (local + prod) |
| 3. Types & services | `types.ts`, uploads/parser/reports services | Deterministic parser robustness on OCR vs clean text |
| 4. Upload + review step | Upload page/form/API + mandatory OCR review UI | Review UX correctness; submit-gating logic |
| 5. Report dashboard | Escaped `<pre>` report + upload history | XSS safety (no Markdown-as-HTML) |
| 6. DELETE RLS | Delete policies on tables + Storage | RLS correctness / cross-user isolation |

**Prerequisites:** F-01 complete (done); local Supabase + Docker for auth testing; sample
PDFs from Diagnostyka (OCR path) and ALAB/Enel Med (text path).
**Estimated effort:** ~4–6 sessions across 6 phases (Phase 1 + Phase 4 are the heaviest;
Phases 2/5/6 are largely carried over from the prior plan).

## Open Risks & Assumptions

- OCR may mis-read small/dense lab values — mitigated by high render scale + mandatory
  review, but the review UX must make verification easy or users will rubber-stamp it.
- Tesseract `pol` accuracy on multi-column Diagnostyka layouts is unverified at scale —
  Phase 1 manual verification on a real Diagnostyka PDF is the gate before proceeding.
- Assumes the deterministic parser can handle both clean-text and OCR-text whitespace
  variance; Phase 3 tests both fixture types.
- First Diagnostyka upload needs network to fetch OCR assets (CDN), then caches; no
  fully-offline guarantee (accepted).

## Success Criteria (Summary)

- A Diagnostyka PDF upload yields readable Polish lab text via OCR, reviewed by the user,
  and produces a correct report — without any data leaving the browser during extraction.
- A clean (ALAB/Enel Med) PDF uploads with no review step and produces a report.
- The full journey (Magic Link → upload → report) works and persists across sessions.
