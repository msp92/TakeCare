---
change_id: supabase-schema-rls
title: Supabase schema, migrations and RLS (roadmap F-01)
status: archived
created: 2026-05-27
updated: 2026-06-02
archived_at: 2026-06-02T23:56:33Z
---

## Notes

F-01 from [context/foundation/roadmap.md](../../foundation/roadmap.md).

### Cross-tenant isolation (manual sign-off)

Verified locally during implementation:

- **Tables (Phases 1–2):** two test users; RLS limits `uploads` / `extractions` / `reports` to `user_id = auth.uid()`; cross-user SELECT empty; wrong `user_id` INSERT fails.
- **Storage (Phase 3):** `lab-pdfs/{user_id}/{upload_id}.pdf`; own-prefix upload/read OK; foreign prefix and non-PDF MIME denied.

### Handoff to S-01 (`first-pdf-to-report`)

Before user-facing delete UX:

1. Add **DELETE** RLS policies on `uploads`, `extractions`, `reports` (see TODO in `20260527100100_enable_rls_policies.sql`).
2. Add **DELETE** policy on `storage.objects` for `lab-pdfs` (see TODO in `20260527100200_storage_lab_pdfs_bucket.sql`).
3. Verify end-to-end deletion (DB rows + Storage object) in S-01 plan.

Auth today remains email/password; S-01 may switch to Magic Link per roadmap.
