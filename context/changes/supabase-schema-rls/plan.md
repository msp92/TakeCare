# Supabase Schema, Migrations & RLS Implementation Plan

## Overview

Deliver roadmap **F-01**: Postgres schema and Row Level Security for TakeCare’s health data foundation — `uploads`, `extractions` (1:1 JSON per upload), and a single per-user `reports` row — plus a private Storage bucket for PDFs. This change is **migrations and docs only**; application upload/processing flows belong to **S-01** (`first-pdf-to-report`).

## Current State Analysis

- **Supabase CLI project** exists (`supabase/config.toml`) with Storage enabled (50MiB limit). If partial F-01 artifacts already exist from a paused implementation run, continue from the latest applied migration instead of recreating earlier files.
- **App** uses `@supabase/ssr` for **auth only** (`src/lib/supabase.ts`, `src/middleware.ts`, `src/pages/api/auth/*`). No `.from()` or Storage calls.
- **README** still states auth-only (no tables) — stale vs F-01.
- **`src/types.ts`** does not exist (deferred to S-01 per planning decisions).

### Key Discoveries

- Migration naming convention: `supabase/migrations/YYYYMMDDHHmmss_short_description.sql` (`CLAUDE.md`).
- PRD requires per-account isolation, persisted JSON + Markdown report, and user-deletable uploads/reports (NFR) — delete **policies** deferred to S-01, but schema should not block them.
- Roadmap risk: RLS must be in place before real health data testing; F-01 delivers SELECT/INSERT/UPDATE isolation; DELETE comes with S-01 delete UX.

## Desired End State

After this plan:

1. `npx supabase db reset` applies migrations cleanly on a fresh local stack.
2. Tables `uploads`, `extractions`, `reports` exist in `public` with RLS **enabled** and policies allowing authenticated users to **read and write only their own rows** (SELECT, INSERT, UPDATE).
3. Private Storage bucket `lab-pdfs` accepts PDF objects only under `{user_id}/{upload_id}.pdf` for the owning user.
4. README documents the data layer; `seed.sql` exists (empty or commented stub) so `db reset` does not fail.

**Verification:** Two test users in local Studio/API cannot read each other’s rows; Storage upload to another user’s prefix is denied.

## What We're NOT Doing

- Application routes, React UI, or PDF extraction (S-01).
- Magic Link auth switch (`signInWithOtp`) — S-01.
- `src/types.ts` entity stubs — S-01 when API contracts stabilize.
- RLS **DELETE** policies and user-facing delete flows — S-01 (explicit planning decision; document as follow-up).
- JSON schema `CHECK` constraints on `extractions.payload` — extraction spike / S-01.
- Report version history — single upsertable row per user only.
- Remote Supabase project push / production deploy (document steps; execute when user has cloud project ready).
- `supabase gen types` CI integration — optional follow-up.

## Implementation Approach

Three migration files (one per security layer), executed in order: **schema → RLS → Storage**. Keep policies granular per operation (`SELECT`, `INSERT`, `UPDATE`) for `authenticated` role only. Denormalize `user_id` on `extractions` for simple policies without joins. Use `auth.users(id)` as FK target with `ON DELETE CASCADE` so account removal cleans app data.

## Critical Implementation Details

**DELETE deferred:** F-01 intentionally omits DELETE policies. Until S-01 adds them, users cannot delete via PostgREST/anon client — acceptable while no production health data exists. S-01 must add DELETE policies and Storage object removal together to satisfy PRD NFR.

**Storage + DB consistency:** `uploads.storage_path` must match the Storage object key (`{user_id}/{upload_id}.pdf`). S-01 upload handler owns creating the DB row and uploading the object in a defined order (document in S-01 plan).

**RLS testing before real PDFs:** Manual verification in Phase 4 is mandatory before S-01 tests with real lab PDFs.

---

## Phase 1: Core schema migration

### Overview

Create enums, tables, constraints, and indexes. No policies yet (RLS enabled in Phase 2).

### Changes Required

#### 1. Initial schema migration

**File:** `supabase/migrations/20260527100000_create_core_schema.sql`

**Intent:** Define the three entity tables and relationships matching PRD data flow: many uploads per user, one extraction per upload, one report per user.

**Contract:**

- Enum `upload_status`: `pending`, `processing`, `succeeded`, `failed`.
- Table `uploads`:
  - `id` uuid PK default `gen_random_uuid()`
  - `user_id` uuid NOT NULL references `auth.users(id)` ON DELETE CASCADE
  - `storage_path` text NOT NULL (full object key, e.g. `{user_id}/{upload_id}.pdf`)
  - `original_filename` text
  - `status` `upload_status` NOT NULL default `pending`
  - `facility_template` text NULL (placeholder for FR-002 single-facility discriminator)
  - `created_at`, `updated_at` timestamptz NOT NULL default `now()`
- Table `extractions`:
  - `id` uuid PK
  - `upload_id` uuid NOT NULL unique references `uploads(id)` ON DELETE CASCADE
  - `user_id` uuid NOT NULL references `auth.users(id)` ON DELETE CASCADE (denormalized for RLS)
  - `payload` jsonb NOT NULL (unconstrained shape in F-01)
  - `created_at` timestamptz NOT NULL default `now()`
- Table `reports`:
  - `user_id` uuid PK references `auth.users(id)` ON DELETE CASCADE
  - `content` text NOT NULL default `''`
  - `updated_at` timestamptz NOT NULL default `now()`
- Indexes: `uploads(user_id, created_at desc)`, `extractions(user_id)`.
- Add a DB-managed `BEFORE UPDATE` trigger for `uploads.updated_at` in F-01 (do not defer to app-level updates).

### Success Criteria

#### Automated Verification

- `npx supabase db reset` completes without SQL errors
- `npx supabase migration list --local` shows `20260527100000_create_core_schema` applied

#### Manual Verification

- In Studio Table Editor, all three tables visible with expected columns
- Inserting an upload row via SQL service role succeeds; FK to non-existent user fails

**Implementation Note:** Pause for human confirmation after manual checks before Phase 2.

---

## Phase 2: Row Level Security policies

### Overview

Enable RLS and add per-operation policies for the `authenticated` role. No DELETE policies in F-01.

### Changes Required

#### 1. RLS migration

**File:** `supabase/migrations/20260527100100_enable_rls_policies.sql`

**Intent:** Enforce flat single-tenant model: `user_id = auth.uid()` for all access.

**Contract:**

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on `uploads`, `extractions`, `reports`.
- For each table, policies named consistently, e.g. `uploads_select_own`, `uploads_insert_own`, `uploads_update_own`:
  - **SELECT** USING (`user_id = auth.uid()`)
  - **INSERT** WITH CHECK (`user_id = auth.uid()`)
  - **UPDATE** USING (`user_id = auth.uid()`) WITH CHECK (`user_id = auth.uid()`)
- `extractions`: on INSERT, application must set `user_id` to match parent upload (S-01); optional trigger in S-01 to copy from `uploads.user_id` if desired later.
- `reports`: same pattern on `user_id`.
- **No** policies for `anon` role on these tables.
- Document `-- TODO(S-01): DELETE policies + Storage object cleanup` at end of file.

### Success Criteria

#### Automated Verification

- `npx supabase db reset` succeeds after both migrations

#### Manual Verification

- As User A (authenticated via Studio SQL or test JWT): SELECT own rows works; SELECT User B rows returns empty
- INSERT with wrong `user_id` fails
- DELETE attempt as authenticated user fails (no policy) — expected until S-01

**Implementation Note:** Pause for human confirmation before Phase 3.

---

## Phase 3: Storage bucket and object policies

### Overview

Create private PDF bucket with path-prefix isolation aligned to `uploads.storage_path`.

### Changes Required

#### 1. Storage migration

**File:** `supabase/migrations/20260527100200_storage_lab_pdfs_bucket.sql`

**Intent:** Store pre-anonymized PDFs per user with MIME and size guardrails.

**Contract:**

- Insert into `storage.buckets`: `id = 'lab-pdfs'`, `public = false`, `file_size_limit` aligned with config (50MiB), `allowed_mime_types = ['application/pdf']`.
- Policies on `storage.objects` for bucket `lab-pdfs`:
  - **SELECT** (download): authenticated user, `(storage.foldername(name))[1] = auth.uid()::text`
  - **INSERT**: same folder check on `name`
  - **UPDATE**: same (if overwrite needed)
  - **DELETE**: defer to S-01 (comment in migration) OR add DELETE with same folder check if trivial — planning chose defer; omit DELETE policy here
- Object key convention: `{user_id}/{upload_id}.pdf` (upload id matches `uploads.id`).
- Add inline SQL comments in the migration that document expected allow/deny behavior for own vs foreign prefixes.

#### 2. Optional config.toml comment

**File:** `supabase/config.toml`

**Intent:** Document bucket for local dev discoverability (bucket creation is in SQL migration for remote parity).

**Contract:** Add commented `[storage.buckets.lab-pdfs]` block mirroring migration settings — do not duplicate conflicting config.

### Success Criteria

#### Automated Verification

- `npx supabase db reset` applies storage migration without error

#### Manual Verification

- User A uploads PDF to `lab-pdfs/{user_a_id}/{uuid}.pdf` — success
- User A cannot read object under User B’s prefix
- Non-PDF MIME rejected
- Policy behavior explicitly verified: own-prefix SELECT/INSERT allowed; foreign-prefix SELECT/INSERT denied

**Implementation Note:** Pause for human confirmation before Phase 4.

---

## Phase 4: Documentation and local dev alignment

### Overview

Fix stale docs, seed stub, and document verification commands for contributors.

### Changes Required

#### 1. README Supabase section

**File:** `README.md`

**Intent:** Replace “auth only, no migrations” with F-01 workflow.

**Contract:** Document `supabase/migrations/`, `npx supabase db reset`, Studio URLs, and that app data requires migrations before S-01 features. Link to `context/changes/supabase-schema-rls/plan.md` for schema reference.

#### 2. Seed stub

**File:** `supabase/seed.sql`

**Intent:** Satisfy `config.toml` `sql_paths` without seed data.

**Contract:** File contains only comments explaining no seed data in F-01 (e.g. `-- No seed data; use Studio or S-01 test fixtures`).

#### 3. Change record

**File:** `context/changes/supabase-schema-rls/change.md`

**Intent:** Mark change as planned.

**Contract:** `status: planned`, `updated: 2026-05-27`.

### Success Criteria

#### Automated Verification

- `npm run lint` passes (no regressions from doc-only edits)
- `npx supabase db reset` end-to-end

#### Manual Verification

- New contributor can follow README to reset DB and see tables + bucket
- Cross-tenant isolation checklist completed (document results in PR or change notes)
- Linked S-01 follow-up explicitly tracks DELETE table + Storage policies before deletion UX is considered complete

---

## Testing Strategy

### Unit Tests

None in repo today — not introduced in F-01.

### Integration Tests

Deferred to S-01 (upload API + RLS together).

### Manual Testing Steps

1. `npx supabase start` (Docker running).
2. `npx supabase db reset`.
3. Create two auth users in Studio.
4. Via SQL editor as service role, insert upload/extraction/report for each user.
5. Impersonate or use API with each user JWT — verify isolation on all three tables.
6. Upload PDFs to Storage with correct and incorrect prefixes.
7. Confirm DELETE on tables/storage fails until S-01 policies exist.

## Performance Considerations

- Indexes on `uploads(user_id, created_at)` support listing user uploads in S-01.
- Single `reports` row per user avoids large history scans.
- `jsonb` payload without GIN index in F-01 — add in S-01/S-02 if query patterns require it.

## Migration Notes

- **Local:** `npx supabase db reset` reapplies all migrations + seed stub.
- **Remote:** When cloud project exists, `npx supabase db push` (or link + push per team workflow). Run before any staging test with real health data.
- **Handoff gate:** F-01 can be closed with DELETE deferred only if S-01 explicitly includes DELETE table + Storage policies and end-to-end deletion verification.
- **Rollback:** Revert migration files and reset; no production data in F-01 scope.

## References

- `context/foundation/roadmap.md` — F-01 (lines 50–61)
- `context/foundation/prd.md` — FR-003–006, NFR, Access Control
- `context/changes/supabase-schema-rls/change.md`
- `src/lib/supabase.ts` — SSR client (auth today)
- `CLAUDE.md` — migration naming + RLS convention

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Core schema migration

#### Automated

- [x] 1.1 `npx supabase db reset` completes without SQL errors — 95269d8
- [x] 1.2 `npx supabase migration list --local` shows `20260527100000_create_core_schema` applied — 95269d8

#### Manual

- [x] 1.3 Studio shows `uploads`, `extractions`, `reports` with expected columns — 95269d8
- [x] 1.4 FK to `auth.users` enforced (invalid `user_id` rejected) — 95269d8

### Phase 2: Row Level Security policies

#### Automated

- [x] 2.1 `npx supabase db reset` succeeds with RLS migration — f9c91a0

#### Manual

- [x] 2.2 User A cannot SELECT User B rows on all three tables — f9c91a0
- [x] 2.3 INSERT/UPDATE with mismatched `user_id` fails — f9c91a0
- [x] 2.4 DELETE as authenticated user denied (expected until S-01) — f9c91a0

### Phase 3: Storage bucket and object policies

#### Automated

- [x] 3.1 `npx supabase db reset` applies storage migration — 07a30f6

#### Manual

- [x] 3.2 User A can upload/read own PDF under `lab-pdfs/{user_id}/` — 07a30f6
- [x] 3.3 User A cannot access User B prefix — 07a30f6
- [x] 3.4 Non-PDF upload rejected — 07a30f6
- [x] 3.5 Storage policy allow/deny behavior verified for own vs foreign prefixes — 07a30f6

### Phase 4: Documentation and local dev alignment

#### Automated

- [x] 4.1 `npm run lint` passes
- [x] 4.2 `npx supabase db reset` end-to-end after README/seed changes

#### Manual

- [x] 4.3 README migration workflow verified by fresh read-through
- [x] 4.4 Cross-tenant isolation checklist signed off
- [x] 4.5 S-01 follow-up includes DELETE policy + verification handoff
