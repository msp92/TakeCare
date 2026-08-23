# S-03: Usuwanie uploadów i raportu przez użytkownika — Plan Brief

> Full plan: `context/changes/user-delete/plan.md`  
> Change identity: `context/changes/user-delete/change.md`

## What & Why

Close the final MVP CRUD gap: users can delete an individual lab-PDF upload, which removes the file from Storage, cascades the extraction, and rebuilds the longitudinal Markdown report from the remaining uploads. When the last upload is deleted, the report row is removed too.

## Starting Point

Schema, RLS DELETE policies, and FK cascades are already in place. The dashboard shows a read-only upload list with no actions. The upload pipeline is append-only; no delete API or UI exists yet.

## Desired End State

Authenticated users see a delete button on each upload row. Confirming deletes the upload, its PDF, and refreshes the report. The system returns success even if a best-effort Storage or report-rebuild step fails, logging the error.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Report row when last upload deleted | DELETE row | Cleaner data state; dashboard `maybeSingle` handles absence | Plan (user) |
| Independent "clear report" action | Not exposed | Avoids inconsistency with append-only upload pipeline | Plan (user) |
| Upload pipeline behavior | Keep append-only | Out of scope for this slice; rebuild only on delete | Plan (user) |
| Delete confirmation | Native `confirm()` | Fastest, no new shadcn dependency | Plan (user) |
| Delete interaction | Client fetch + page reload | Consistent with `UploadForm`, simple error handling | Plan (user) |
| Report rebuild failure | Return success, log error | Upload is already deleted; user should not see failure | Plan (user) |
| Test scope | Unit tests for pure rebuild function | No API/integration test harness yet | Plan (user) |

## Scope

**In scope:**
- `DELETE /api/uploads/[id]` endpoint
- `deleteUpload` and `rebuildReportFromExtractions` service functions
- `UploadHistory` delete buttons with native confirm
- Vitest unit tests for report rebuild pure function

**Out of scope:**
- Soft delete / trash
- Separate "clear report" endpoint or button
- Rebuilding report on every upload
- Account deletion
- Integration/API/E2E tests

## Architecture / Approach

A new `src/lib/services/deletes.ts` orchestrates DB delete (FK cascade), Storage removal, and report rebuild. The rebuild queries remaining `extractions` rows, regenerates Markdown sections via the existing `buildReportSection`, and either upserts the report or deletes the row when no extractions remain. A `DELETE` API route wraps this for the dashboard, where `UploadHistory` becomes a hydrated island with per-row delete buttons.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend delete service and API route | `DELETE /api/uploads/[id]` works end-to-end | Report rebuild ordering / partial failure handling |
| 2. Report rebuild unit tests | Pure rebuild logic is covered | Date fallback behavior drifts on rebuild |
| 3. Dashboard UI delete buttons | User can delete uploads from dashboard | Hydration / client-side error display |

**Prerequisites:** S-01 (first-pdf-to-report) must be functional.  
**Estimated effort:** 2–3 sessions, 3 phases.

## Open Risks & Assumptions

- Rebuilding a report with null-date items uses today's date, which may differ from the original upload date. This matches existing behavior.
- Storage deletion is best-effort; orphaned objects are inaccessible through RLS but still consume space.
- No API/integration tests exist yet; manual verification is required.

## Success Criteria (Summary)

- User can delete an upload from the dashboard.
- Report updates correctly after deletion and disappears when the last upload is deleted.
- New unit tests pass; lint and build are green.
