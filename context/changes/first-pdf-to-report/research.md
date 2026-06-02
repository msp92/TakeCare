---
date: 2026-06-01T12:00:00+02:00
researcher: Composer
git_commit: 173a39bbac7ffd760fd5b6b9a3478994fff70ab7
branch: main
repository: TakeCare
topic: "S-01 first-pdf-to-report — codebase readiness for Magic Link, PDF upload, extraction, and Markdown report"
tags: [research, codebase, auth, supabase, pdf, unpdf, diagnostyka, cloudflare-workers, pdf-extraction]
status: complete
last_updated: 2026-06-01
last_updated_by: Composer
last_updated_note: "Added official unpdf API reference from Context7 (/unjs/unpdf)"
---

# Research: S-01 first-pdf-to-report

**Date**: 2026-06-01T12:00:00+02:00  
**Researcher**: Composer  
**Git Commit**: [`173a39b`](https://github.com/msp92/TakeCare/commit/173a39bbac7ffd760fd5b6b9a3478994fff70ab7)  
**Branch**: main  
**Repository**: [msp92/TakeCare](https://github.com/msp92/TakeCare)

## Research Question

What exists in the TakeCare codebase today for roadmap slice **S-01** (`first-pdf-to-report`) — Magic Link sign-in, pre-anonymized Diagnostyka PDF upload (≤2 pages), text extraction with `unpdf`, structured JSON persistence, Markdown report generation/display — and what must still be built, given prerequisite **F-01** (`supabase-schema-rls`)?

## Summary

TakeCare is an **Astro 6 SSR app on Cloudflare Workers** with **Supabase cookie auth** and a **complete F-01 data layer** (tables `uploads`, `extractions`, `reports`; private Storage bucket `lab-pdfs`). The **north-star user journey is not implemented in `src/`**: no upload UI/API, no `unpdf` usage, no Diagnostyka parser, no report builder or viewer. Auth still uses **email/password** (`signInWithPassword`), not Magic Link.

**F-01 is ready for S-01** with a documented handoff: storage path `{user_id}/{upload_id}.pdf` must match `uploads.storage_path`; RLS isolates per user; **DELETE policies are deferred** to S-01. `unpdf` is in `package.json` but unused; `debug:pdf` points at a **missing** `scripts/debug-pdf-parse.ts`.

A **plan review** (`reviews/plan-review.md`, 2026-05-30) rated the implementation plan **SOUND** with phased work: Phase 0 spike → Magic Link → upload pipeline → report dashboard → manual acceptance. Implementation can proceed with `/10x-implement` once `plan.md` is committed and readable in the workspace.

## Detailed Findings

### Foundation (F-01) — schema and storage

F-01 migrations define the contract S-01 must follow:

| Entity | Contract |
|--------|----------|
| `uploads` | Status enum `pending` \| `processing` \| `succeeded` \| `failed`; `storage_path` unique; optional `facility_template` |
| `extractions` | 1:1 `upload_id`; `payload` jsonb; `user_id` denormalized |
| `reports` | One row per user (`user_id` PK); `content` text (Markdown) |
| Storage | Bucket `lab-pdfs`, private, PDF MIME only, key `{user_id}/{upload_id}.pdf` |

RLS grants `authenticated` users SELECT/INSERT/UPDATE on own rows; extractions INSERT/UPDATE require parent upload ownership. Storage policies scope objects to `auth.uid()` as first path segment. **DELETE** on tables and Storage objects is **not** granted yet (TODO in migrations).

**App gap:** No `.from()`, `.storage`, or domain types in `src/` — only [`src/lib/supabase.ts`](https://github.com/msp92/TakeCare/blob/173a39bbac7ffd760fd5b6b9a3478994fff70ab7/src/lib/supabase.ts) for auth SSR.

Handoff checklist from F-01 change notes: add DELETE RLS before delete UX; verify end-to-end deletion; Magic Link is S-01’s responsibility.

### Authentication (FR-001)

| Area | State | S-01 action |
|------|--------|-------------|
| Middleware session | `getUser()` → `locals.user`; protects `/dashboard` only | Extend `PROTECTED_ROUTES` for upload/report paths |
| `supabase.ts` | Cookie SSR client — sufficient for OTP | Reuse on callback route |
| Sign-in API | `signInWithPassword` | `signInWithOtp` + `emailRedirectTo` |
| Sign-up API/UI | Password registration | Remove or merge into single email flow |
| Auth callback | **Missing** | Add route with `exchangeCodeForSession` (PKCE) |
| Auth UI | Email + password forms | Email-only + “check your email” |
| Supabase config | OTP limits, Inbucket locally | Align Site URL / redirect URLs with callback (not static `confirm-email` only) |

No `signInWithOtp`, `verifyOtp`, or `exchangeCodeForSession` in `src/` at commit `173a39b`.

### Application surface (upload, extract, report)

**Pages:** `index`, `dashboard` (placeholder welcome), `auth/*` only. No upload or report routes.

**API:** `POST /api/auth/{signin,signup,signout}` only. No multipart upload or processing endpoints.

**Components:** Auth forms + shadcn `button`. No file input, upload progress, or report display.

**Libraries:** `unpdf` ^1.6.2 in dependencies; **zero imports** under `src/`. No parser module for Diagnostyka layout.

**Types:** `src/types.ts` documented in AGENTS.md but **absent**; domain types exist only in SQL migrations.

### Deployment and runtime constraints

- **Adapter:** `@astrojs/cloudflare`, `output: "server"`, `nodejs_compat` in `wrangler.jsonc` (needed for PDF libs on workerd).
- **Secrets:** Only `SUPABASE_URL` and `SUPABASE_KEY` in Astro env schema (server-only).
- **Processing model:** PRD/roadmap require **synchronous** in-request pipeline for small PDFs (≤2 pages, selectable text). No Queues/KV configured in wrangler.
- **Risk:** `context/foundation/infrastructure.md` flags Worker CPU/time on Free tier; mitigations (Paid CPU, Queues, off-hot-path) are post-MVP unless spike fails.

Local dev uses workerd (`npm run dev`); Supabase local email via Inbucket (`127.0.0.1:54324`).

### Product decisions (already locked)

From `context/foundation/roadmap.md` and `prd.md`:

- **Facility v1:** Diagnostyka only; **no** runtime template detector.
- **PDF:** Pre-redacted by user; max 2 pages; reject non-PDF by MIME/type.
- **Extraction:** `unpdf` (`extractText`); spike on two owner-supplied sample PDFs (not in repo if sensitive).
- **Anonymization:** Out of scope (Presidio post-MVP).
- **Report UI (S-01):** Escaped Markdown in `<pre>` per plan review (untrusted content).

### Planning artifacts in this change folder

| File | Status |
|------|--------|
| `change.md` | Identity only (`status: new` → updated to `preparing` after this research) |
| `reviews/plan-review.md` | **SOUND** (2026-05-30); phases 0–4; manual testing only |
| `plan.md`, `plan-brief.md` | Referenced by review; may be untracked or absent on disk in some checkouts — commit before `/10x-implement` |

Phase outline from plan review: **0** unpdf spike on Diagnostyka PDFs → **1** Magic Link → **2** upload API + extraction + `uploads` service → **3** report builder + dashboard → **4** manual acceptance.

### PDF extraction library evaluation (`unpdf`)

**Researched:** 2026-06-01 (browser: [unjs/unpdf](https://github.com/unjs/unpdf), [Cloudflare Workers example](https://github.com/unjs/unpdf/tree/main/examples/cloudflare), [Workers CPU limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time), alternatives).

**Verdict:** **Keep `unpdf` for S-01.** It is the best practical choice for TakeCare MVP given Cloudflare Workers, ≤2-page **selectable-text** PDFs (no OCR), and sync in-request processing. The roadmap decision to use `unpdf` is validated; **do not switch libraries before Phase 0 fails on real Diagnostyka fixtures.**

#### Constraints that drive the choice

| Requirement | Implication |
|-------------|-------------|
| Cloudflare Workers + `nodejs_compat` | Need PDF.js pre-bundled for edge: inlined worker, polyfills for APIs missing on Workers (e.g. `FinalizationRegistry`) |
| ≤2 pages, copy-pasteable text (not scans) | Text extraction only — **no OCR** (Tesseract/native binaries do not run on Workers) |
| Sync pipeline in upload handler | Library must complete inside one Worker invocation |
| Diagnostyka layout → JSON | **Parser after extraction** is the main risk, not the PDF library |
| Roadmap already rejected | Raw `pdfjs-dist`, classic `pdf-parse`, external APIs, async queues for v1 |

#### Why `unpdf` fits

1. **Explicit Workers target** — README: “serverless environments like Cloudflare Workers”; ships a **serverless PDF.js build** (worker inlined, string replacements, global polyfills).
2. **Official Cloudflare example** — [`examples/cloudflare/index.ts`](https://github.com/unjs/unpdf/blob/main/examples/cloudflare/index.ts): `getDocumentProxy` → `extractText` inside a Worker `fetch` handler.
3. **Same engine as alternatives** — Bundled PDF.js v5.6.205; `pdfjs-serverless` is a lower-level drop-in from the same ecosystem, not a different extraction model.
4. **Matches PDF type** — Digital lab PDFs: `extractText` is the right layer; OCR and image-render pipelines are out of scope.
5. **CPU likely sufficient** — Cloudflare docs: average Worker ~2.2 ms CPU/request; paid plans default 30s CPU (configurable higher). Two-page text extract is unlikely to dominate vs parser + Supabase I/O.
6. **Already in repo** — `unpdf` ^1.6.2 in `package.json`; aligns with `context/foundation/roadmap.md`.

#### What `unpdf` does not solve

- **Table/column layout** — `extractText({ mergePages: true })` returns a **flat string**; multi-column lab layouts may scramble reading order even when every character is correct. This matches roadmap risk: *“parser layoutu Diagnostyka, nie biblioteka PDF.”*
- **`renderPageAsImage` on Workers** — Not supported (needs canvas); [unpdf#10](https://github.com/unjs/unpdf/issues/10) — irrelevant for text-native PDFs.
- **Official `pdfjs-dist` on Workers** — Avoid unless required: v5.x uses `Promise.withResolvers`; unpdf’s **bundled serverless build** includes polyfills. Do not call `definePDFJSModule(() => import('pdfjs-dist'))` in production Worker code without a strong reason.

#### Mitigations (still using `unpdf`)

- Phase 0 spike on **two owner Diagnostyka PDFs** — success = parser can build JSON from extracted text.
- Use **`mergePages: false`** (per-page strings) or lower-level PDF.js via `getResolvedPDFJS()` / `getTextContent()` if columns break.
- Evaluate **`extractTextItems`** (documented API; returns `StructuredTextItem` with `x`, `y`, `width`, `height`, `fontSize`, etc.) if flat `extractText` loses structure — see [Official API reference (Context7)](#official-unpdf-api-reference-context7) below.

#### Alternatives considered

| Option | Fit for TakeCare S-01 |
|--------|------------------------|
| **`unpdf`** (chosen) | Best default: Workers-first, `extractText` API, CF example, maintained |
| **`pdfjs-serverless`** | Same edge bundle idea, more boilerplate; Plan B if need raw PDF.js only |
| **`pdf-parse` (mehmet-kozan, TS)** | Claims Workers support; less battle-tested for this stack than unpdf’s CF example |
| **`pdf-parse` (classic / modesty)** | Node `fs`/worker assumptions — **poor Workers fit** (roadmap rejected) |
| **Raw `pdfjs-dist`** | Separate worker files, config pain on Workers — why unpdf exists |
| **LiteParse / layout parsers** | Better layout; heavier; WASM/edge story more complex — overkill if text + Diagnostyka parser suffices |
| **External PDF APIs** | Privacy, cost, MVP scope — rejected |
| **OCR (Tesseract, etc.)** | Only for scans; not needed for selectable-text PDFs |

#### Implementation notes

- Use the **default serverless build** (do not opt into official `pdfjs-dist` on Workers unless spike proves otherwise).
- Wire `scripts/debug-pdf-parse.ts` for Phase 0 (`npm run debug:pdf` currently points at a **missing** script).
- **Revisit library only if** spike shows: empty/garbled text, or unfixable column order with `getTextContent`/text items — then try `pdfjs-serverless` before OCR or external services.

#### Official `unpdf` API reference (Context7)

Sourced via Context7 library **`/unjs/unpdf`** (High reputation, 66 code snippets, benchmark 88). TakeCare pins **`unpdf` ^1.6.2** in `package.json`; bundled PDF.js in docs below is **v5.6.205**.

**Primary doc URLs**

| Source | URL |
|--------|-----|
| Context7 LLM-oriented docs | https://context7.com/unjs/unpdf/llms.txt |
| GitHub README (canonical API) | https://github.com/unjs/unpdf/blob/main/README.md |
| unjs package page | https://unjs.io/packages/unpdf |
| Cloudflare Worker example (repo) | https://github.com/unjs/unpdf/blob/main/examples/cloudflare/index.ts |

**Installation** (from README)

```bash
npm install unpdf
# or: pnpm add unpdf
```

**Default behavior (important for Workers)**

- **No config required** for edge/serverless: unpdf ships a **serverless build of PDF.js** (`unpdf/pdfjs`) — worker inlined, browser-specific code stripped, polyfills for missing globals (e.g. `FinalizationRegistry` on Cloudflare Workers).
- **Do not** call `definePDFJSModule(() => import('pdfjs-dist'))` on Workers unless spike proves the bundled build fails. Official `pdfjs-dist` v5.x needs `Promise.withResolvers` (Node ≥ 22); the bundled build includes polyfills.
- `getResolvedPDFJS()` reports version **`5.6.205`** when using the default build.

**How the serverless bundle is built** (README): Rollup bundles PDF.js for serverless — string replacements remove browser-only paths, **worker inlined** (separate worker files cannot load on Workers), global polyfills for missing APIs.

**Recommended pipeline for TakeCare (S-01)**

```typescript
import { extractText, getDocumentProxy } from "unpdf";

// pdfBytes: Uint8Array from Supabase Storage download or upload buffer
const pdf = await getDocumentProxy(pdfBytes);

// Option A — per-page strings (better for ≤2-page lab layout parsing)
const { totalPages, text: pages } = await extractText(pdf);
// pages: string[] — one entry per page

// Option B — single string (simpler; may scramble multi-column order)
const { text } = await extractText(pdf, { mergePages: true });
// text: string — merged with collapsed whitespace (README: “ideal for AI summarization”)

// Option C — layout-aware (Diagnostyka parser spike)
import { extractTextItems } from "unpdf";
import type { StructuredTextItem } from "unpdf";

const { items } = await extractTextItems(pdf);
// items: StructuredTextItem[][] — one array per page
```

Reuse one proxy for multiple operations (metadata + text + links):

```typescript
import { extractLinks, extractText, getDocumentProxy, getMeta } from "unpdf";

const pdf = await getDocumentProxy(pdfBytes);
const { info } = await getMeta(pdf);
const { text } = await extractText(pdf, { mergePages: true });
const { links } = await extractLinks(pdf);
```

`extractText` also accepts raw `Uint8Array` / `ArrayBuffer` without `getDocumentProxy` (same as passing proxy).

**API summary (functions relevant to S-01)**

| Function | Purpose | Notes for TakeCare |
|----------|---------|-------------------|
| `getDocumentProxy(data, options?)` | Parse PDF once; reuse for extractions | Defaults: `isEvalSupported: false`, `useSystemFonts: true`. In Node, also `disableFontFace: true` + local `standardFontDataUrl`. On Workers, use defaults unless fonts garble text. |
| `extractText(data, options?)` | All text; per-page `string[]` or merged `string` | `mergePages: true` → `{ totalPages, text: string }`; default → `{ totalPages, text: string[] }`. |
| `extractTextItems(data)` | Positioned text per page | `StructuredTextItem`: `str`, `x`, `y`, `width`, `height`, `fontSize`, `fontFamily`, `dir`, `hasEOL`. **Preferred for Diagnostyka layout spike.** |
| `getMeta(data, { parseDates? })` | `/Info` + XMP metadata | Optional `parseDates: true` for `Date` objects. |
| `extractLinks(data)` | Flat `string[]` of URLs | Unlikely needed for lab PDFs v1. |
| `extractImages(data, pageNumber)` | Raw image bytes per page | Not needed for text-native PDFs. |
| `getResolvedPDFJS()` | Low-level PDF.js (`getDocument`, etc.) | Escape hatch if helpers are insufficient. |
| `definePDFJSModule(() => import(...))` | Swap PDF.js build | **Avoid on Workers** for MVP; must be awaited before any other unpdf call. |
| `renderPageAsImage(...)` | Page → PNG buffer / data URL | **Node.js and browser only** (needs `@napi-rs/canvas` on Node). **Not for Cloudflare Workers.** |

**`extractText` type signatures** (README)

```typescript
function extractText(
  data: DocumentInitParameters["data"] | PDFDocumentProxy,
  options?: { mergePages?: false },
): Promise<{ totalPages: number; text: string[] }>;

function extractText(
  data: DocumentInitParameters["data"] | PDFDocumentProxy,
  options: { mergePages: true },
): Promise<{ totalPages: number; text: string }>;
```

**`getDocumentProxy` optional overrides** (README) — only if spike shows missing/garbled glyphs:

```typescript
const pdf = await getDocumentProxy(buffer, {
  disableFontFace: false,
  standardFontDataUrl: "https://unpkg.com/pdfjs-dist@latest/standard_fonts/",
});
```

On Workers, loading fonts from a CDN adds latency; try bundled defaults first.

**Methods out of scope for S-01 Workers path**

- `renderPageAsImage` — requires canvas; README states Node/browser only.
- `extractImages` + `sharp` — Node image pipeline; not applicable to sync Worker text extract.
- `definePDFJSModule(() => import("pdfjs-dist"))` — use bundled serverless build instead.

#### External references

- [unjs/unpdf README](https://github.com/unjs/unpdf) — features, `extractText`, “How it works” (Rollup bundle, worker inlining, polyfills)
- [Context7 unpdf docs](https://context7.com/unjs/unpdf/llms.txt) — API examples (`extractTextItems`, `getMeta`, `definePDFJSModule`)
- [unpdf Cloudflare example](https://github.com/unjs/unpdf/blob/main/examples/cloudflare/index.ts)
- [pdfjs-serverless](https://github.com/johannschopplich/pdfjs-serverless) — lower-level Workers bundle (same author family)
- [Cloudflare Workers CPU time limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)

## Code References

### Data layer (F-01)

- [`supabase/migrations/20260527100000_create_core_schema.sql`](https://github.com/msp92/TakeCare/blob/173a39bbac7ffd760fd5b6b9a3478994fff70ab7/supabase/migrations/20260527100000_create_core_schema.sql) — `uploads`, `extractions`, `reports`
- [`supabase/migrations/20260527100100_enable_rls_policies.sql`](https://github.com/msp92/TakeCare/blob/173a39bbac7ffd760fd5b6b9a3478994fff70ab7/supabase/migrations/20260527100100_enable_rls_policies.sql) — table RLS; DELETE TODO
- [`supabase/migrations/20260527100200_storage_lab_pdfs_bucket.sql`](https://github.com/msp92/TakeCare/blob/173a39bbac7ffd760fd5b6b9a3478994fff70ab7/supabase/migrations/20260527100200_storage_lab_pdfs_bucket.sql) — `lab-pdfs` bucket and policies

### App (auth shell only)

- [`src/middleware.ts:4`](https://github.com/msp92/TakeCare/blob/173a39bbac7ffd760fd5b6b9a3478994fff70ab7/src/middleware.ts#L4) — `PROTECTED_ROUTES`
- [`src/pages/api/auth/signin.ts:13`](https://github.com/msp92/TakeCare/blob/173a39bbac7ffd760fd5b6b9a3478994fff70ab7/src/pages/api/auth/signin.ts#L13) — `signInWithPassword`
- [`src/pages/dashboard.astro`](https://github.com/msp92/TakeCare/blob/173a39bbac7ffd760fd5b6b9a3478994fff70ab7/src/pages/dashboard.astro) — authenticated placeholder
- [`src/lib/supabase.ts`](https://github.com/msp92/TakeCare/blob/173a39bbac7ffd760fd5b6b9a3478994fff70ab7/src/lib/supabase.ts) — SSR Supabase client

### Config / deps

- [`package.json`](https://github.com/msp92/TakeCare/blob/173a39bbac7ffd760fd5b6b9a3478994fff70ab7/package.json) — `unpdf`, `debug:pdf` → missing script
- [`astro.config.mjs`](https://github.com/msp92/TakeCare/blob/173a39bbac7ffd760fd5b6b9a3478994fff70ab7/astro.config.mjs) — Cloudflare adapter, env schema
- [`wrangler.jsonc`](https://github.com/msp92/TakeCare/blob/173a39bbac7ffd760fd5b6b9a3478994fff70ab7/wrangler.jsonc) — `nodejs_compat`

### Verification snippets (manual, not app)

- `supabase/snippets/test-rls-user-a.sql`
- `supabase/snippets/test-storage-user-a.ps1`

## Architecture Insights

1. **Vertical slice pattern:** S-01 should add `src/lib/services/` (or similar) for upload orchestration, parsing, and report building — matching AGENTS.md conventions; keep API routes thin with zod validation.
2. **Upload ordering:** Insert `uploads` row (get `id`) → upload to Storage at `{user_id}/{upload_id}.pdf` with matching `storage_path` → process synchronously → update status and related rows. Orphan Storage/JSON on partial failure is an accepted MVP debt per plan review.
3. **Single report row:** `reports.user_id` PK implies upsert/merge on each successful upload rather than multiple report documents per user in v1.
4. **Security:** RLS + Storage prefix isolation already enforce tenant boundary; report rendering must not interpret Markdown as HTML without sanitization in S-01.
5. **Auth callback is the critical path** for FR-001; middleware and Supabase client need no structural change.

## Historical Context (from prior changes)

- [`context/changes/supabase-schema-rls/change.md`](context/changes/supabase-schema-rls/change.md) — F-01 `impl_reviewed`; cross-tenant isolation manually verified; handoff DELETE + Magic Link note.
- [`context/changes/supabase-schema-rls/plan.md`](context/changes/supabase-schema-rls/plan.md) — Explicitly scopes app upload/processing to S-01.
- [`context/changes/first-pdf-to-report/reviews/plan-review.md`](context/changes/first-pdf-to-report/reviews/plan-review.md) — SOUND verdict; testing manual-only; orphan extraction semantics; report failure table; `<pre>` rendering.
- [`context/foundation/roadmap.md`](context/foundation/roadmap.md) — S-01 north star, Diagnostyka/`unpdf` decisions, F-01 prerequisite `ready`.
- [`context/archive/`](context/archive/) — No archived PDF-related changes.

## Related Research

- F-01 implementation review: `context/changes/supabase-schema-rls/reviews/impl-review.md`
- Platform risks: `context/foundation/infrastructure.md` (sync PDF CPU, rollback vs Supabase)

## Open Questions

1. **Phase 0 spike:** Have owner’s two Diagnostyka PDFs been run through `unpdf` + a draft parser locally? Root `extracted.txt` (untracked) may be spike output — confirm format and whether text is usable for layout parsing. **Library choice (`unpdf`) is settled** unless spike fails (see PDF extraction library evaluation above).
2. **Worker CPU:** Does sync extract+parse+DB on Free Workers stay under limits with real PDFs? Spike on deployed workerd recommended before locking architecture. Browser research suggests CPU is unlikely to be the blocker for ≤2 text pages; confirm on real PDFs.
3. **Magic Link redirects:** Production/staging `*.workers.dev` URLs vs `docs/cloudflare-deployment.md` pointing at `/auth/confirm-email` — callback path must be allow-listed in Supabase.
4. **DELETE policies:** Required for PRD “user can delete uploads/reports” — schedule in S-01 even if delete UI is minimal.
5. **`plan.md` visibility:** Ensure plan artifacts are committed so `/10x-implement` agents read a single source of truth (review exists; full plan was inconsistent across environments during research).
6. **Email deliverability:** PRD open question — resend UX; does not block implementation but affects first-login success rate.

## Suggested build order (for planning/implementation)

1. Phase 0: `scripts/debug-pdf-parse.ts` (or fix `debug:pdf`) + unpdf spike on Diagnostyka fixtures.
2. Magic Link: callback route → `signInWithOtp` → email-only UI → drop password signup.
3. Types + services: `src/types.ts`, upload orchestration, Diagnostyka parser, report builder.
4. Upload API + dashboard UI (file picker, status, escaped report `<pre>`).
5. Migration: DELETE RLS policies + manual deletion verification.
6. Manual E2E: Magic Link → upload → report persists across session (US-01).
