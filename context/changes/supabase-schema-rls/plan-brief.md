# Supabase schema, migrations and RLS — Plan Brief

> Full plan: `context/changes/supabase-schema-rls/plan.md`
> Research: (none — planning used roadmap + PRD + codebase baseline)

## What & Why

TakeCare needs a secure place to store PDF uploads, extracted lab JSON, and aggregated Markdown reports before the north-star upload flow (S-01) can ship. F-01 delivers that foundation: Postgres tables with per-user isolation and a private Storage bucket for PDFs.

## Starting Point

Supabase is configured for local auth only — `src/lib/supabase.ts` handles sessions, but there are no migrations, no app tables, and README still claims auth-only. Storage is enabled in `config.toml` without buckets.

## Desired End State

Developers run `npx supabase db reset` and get `uploads`, `extractions`, and `reports` tables with RLS (SELECT/INSERT/UPDATE for own data), plus private bucket `lab-pdfs` using `{user_id}/{upload_id}.pdf`. Two test users cannot see each other's rows or files. S-01 can build upload/extraction/report APIs on top.

## Key Decisions Made

| Decision | Choice | Why | Source |
| -------- | ------ | --- | ------ |
| F-01 deliverables | Migrations + README + empty seed stub | Local reset works; docs match reality | Plan |
| Report storage | One row per user (upsert) | Matches PRD single longitudinal report | Plan |
| Extraction link | 1:1 row per upload | Clear pipeline + cascade | Plan |
| DELETE RLS | Deferred to S-01 | Faster F-01; policies ship with delete UX | Plan |
| Storage layout | Private `lab-pdfs`, `{user_id}/{upload_id}.pdf` | Standard prefix isolation | Plan |
| Upload metadata | `upload_status` enum | Ready for async processing in S-01 | Plan |
| JSON shape | Unconstrained jsonb | Facility format still open (PRD Q1) | Plan |

## Scope

**In scope:** Three tables + enum; RLS SELECT/INSERT/UPDATE; Storage bucket + object policies (no DELETE); README update; `seed.sql` stub; manual isolation checklist.

**Out of scope:** App upload API, Magic Link, `src/types.ts`, DELETE policies, JSON validation, report versioning, production deploy execution.

## Architecture / Approach

```
auth.users
    ├── uploads (many) ──1:1── extractions (jsonb payload)
    └── reports (one Markdown row per user)

Storage lab-pdfs: {user_id}/{upload_id}.pdf
```

Migrations in three files: schema → RLS → Storage. App uses anon/authenticated key with RLS; no service-role in app for F-01.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Core schema | Tables, FKs, indexes, status enum | Trigger/`updated_at` scope creep |
| 2. RLS | Per-user SELECT/INSERT/UPDATE | DELETE deferred — must land in S-01 before delete UX |
| 3. Storage | `lab-pdfs` bucket + prefix policies | Path must stay in sync with `uploads.storage_path` |
| 4. Docs & verify | README, seed stub, isolation checklist | Stale docs if README not updated |

**Prerequisites:** Docker for `npx supabase start`; Supabase CLI in devDependencies.

**Estimated effort:** ~1–2 focused sessions across 4 phases.

## Open Risks & Assumptions

- DELETE policies omitted in F-01 — S-01 must add them before PRD delete commitment is met.
- `extractions.payload` shape undefined until facility PDF spike (PRD Open Q1).
- Remote `db push` not executed in F-01 — team runs when cloud project is ready.
- Real health data testing waits until Phase 4 manual RLS sign-off.

## Success Criteria (Summary)

- `supabase db reset` applies all migrations cleanly.
- Authenticated users isolated on tables and Storage prefixes.
- README guides contributors through migration workflow.
- S-01 unblocked to implement Magic Link + upload → JSON → report flow.
