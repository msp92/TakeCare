<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Supabase Schema, Migrations & RLS

- **Plan**: context/changes/supabase-schema-rls/plan.md
- **Scope**: All Phases (1–4 of 4)
- **Date**: 2026-05-28
- **Verdict**: APPROVED (post-triage)
- **Findings**: 1 critical · 3 warnings · 4 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — extractions policies don't validate upload_id ownership

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260527100100_enable_rls_policies.sql:34–45
- **Detail**: `extractions_insert_own` and `extractions_update_own` guard only `user_id = auth.uid()` but leave `upload_id` unconstrained. A Postgres FK check runs at the constraint owner's privilege, bypassing RLS — so an authenticated user who learns another user's `upload_id` can INSERT an extraction row with their own `user_id` but the victim's `upload_id`. Because `upload_id` carries a `UNIQUE` constraint, the real server-side job then fails on a unique violation, permanently poisoning that upload (DoS-by-poisoning on sensitive health data). The UPDATE policy has the same gap.
- **Fix**: Add a correlated subquery to both INSERT and UPDATE policies verifying that `upload_id` belongs to the calling user:
  ```sql
  create policy extractions_insert_own
    on public.extractions for insert to authenticated
    with check (
      user_id = auth.uid()
      and exists (
        select 1 from public.uploads
        where id = upload_id and user_id = auth.uid()
      )
    );

  create policy extractions_update_own
    on public.extractions for update to authenticated
    using (user_id = auth.uid())
    with check (
      user_id = auth.uid()
      and exists (
        select 1 from public.uploads
        where id = upload_id and user_id = auth.uid()
      )
    );
  ```
  - Strength: Closes the cross-ownership gap entirely at the policy layer; subquery hits the indexed `uploads(user_id)` so performance cost is minimal.
  - Tradeoff: S-01 server-side code must set both `user_id` and `upload_id` correctly on INSERT — the policy becomes a correctness gate for the app.
  - Confidence: HIGH — FK + UNIQUE bypass is a known RLS pattern in Postgres; correlated subquery is the standard remedy.
  - Blind spot: None significant.
- **Decision**: FIXED

### F2 — reports table missing updated_at trigger

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260527100000_create_core_schema.sql:51–54
- **Detail**: `set_updated_at()` trigger is wired only to `uploads`. `reports` has `updated_at timestamptz not null default now()` but no BEFORE UPDATE trigger — every UPDATE on `reports` will leave `updated_at` frozen at creation time, misleading any cache-invalidation or display logic in S-01.
- **Fix**: Add `create trigger reports_set_updated_at before update on public.reports for each row execute function public.set_updated_at();` in the schema migration.
- **Decision**: FIXED

### F3 — uploads.storage_path lacks a UNIQUE constraint

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260527100000_create_core_schema.sql:13
- **Detail**: `storage_path` has no UNIQUE constraint. The `{user_id}/{upload_id}.pdf` convention makes collisions practically impossible, but a bug in S-01's upload handler could produce two rows pointing at the same Storage object, silently shadowing the first.
- **Fix**: `alter table public.uploads add constraint uploads_storage_path_unique unique (storage_path);`
- **Decision**: FIXED

### F4 — storage bucket INSERT has no ON CONFLICT guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Reliability
- **Location**: supabase/migrations/20260527100200_storage_lab_pdfs_bucket.sql:4–11
- **Detail**: If the `lab-pdfs` bucket already exists (created manually in Studio or via a partial remote apply), `npx supabase db push` will throw a unique-constraint violation and leave the migration log inconsistent.
- **Fix**: Add `on conflict (id) do nothing` to the bucket INSERT.
- **Decision**: FIXED

### F5 — storage_path format not enforced at schema level

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Data Safety
- **Location**: supabase/migrations/20260527100000_create_core_schema.sql:13
- **Detail**: Storage policies rely on the first path segment being a user UUID. A malformed `storage_path` produces an unreachable DB row with no schema-level signal.
- **Fix**: Add a CHECK constraint with a UUID-format regex on `uploads.storage_path` (can defer to S-01 if preferred, since the upload handler owns path construction).
- **Decision**: SKIPPED (deferred to S-01)

### F6 — minimum_password_length = 6 in config.toml

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/config.toml:181
- **Detail**: 6 is the Supabase default; NIST SP 800-63B recommends 8 for a health-data app. This setting controls local dev only and must also be set manually in the Supabase cloud dashboard.
- **Fix**: Raise to `minimum_password_length = 8` and document the dashboard step in the deployment runbook.
- **Decision**: SKIPPED

### F7 — CREATE OR REPLACE FUNCTION in a versioned migration

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260527100000_create_core_schema.sql:41
- **Detail**: `OR REPLACE` silently overwrites an existing function. For a trigger-only utility with no public RPC surface this is low risk today, but can mask out-of-order migration issues in the future.
- **Fix**: Use plain `CREATE FUNCTION`; if the signature must change in a future migration, use `DROP FUNCTION … CASCADE` then `CREATE FUNCTION` so the change is explicit.
- **Decision**: FIXED

### F8 — README links to change context path that breaks on archive

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: README.md:136
- **Detail**: README links to `context/changes/supabase-schema-rls/plan.md`. When `/10x-archive` runs on this change the path moves to `context/archive/` and the link silently breaks.
- **Fix**: Replace with a stable reference — link to the migration filenames directly or to a future `docs/schema.md`.
- **Decision**: FIXED
