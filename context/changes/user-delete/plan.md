# S-03: Usuwanie uploadów i raportu przez użytkownika — Implementation Plan

## Overview

Implement the missing DELETE capability for the TakeCare MVP: an authenticated user can delete an individual lab-PDF upload, which removes the PDF object from Supabase Storage, cascades the related `extractions` row via FK, and rebuilds the longitudinal Markdown report from the remaining extractions. When the last upload is deleted, the `reports` row is removed as well. No independent "clear report" action is exposed.

## Current State Analysis

- Schema and RLS are already in place: `uploads` → `extractions` has `ON DELETE CASCADE`, and `uploads_delete_own`, `extractions_delete_own`, `reports_delete_own`, `lab_pdfs_delete_own` policies exist in `supabase/migrations/20260601100000_delete_rls_policies.sql`.
- Dashboard (`src/pages/dashboard.astro`) renders a read-only `UploadHistory` component with no per-row actions.
- `src/pages/api/upload.ts` and `src/lib/services/uploads.ts` implement the write pipeline; no delete API or service exists yet.
- Report generation is split: `buildReportSection`/`mergeReportContent` in `src/lib/services/reports.ts` provide pure Markdown logic, while `complete_upload_processing` RPC atomically appends sections during upload.
- Only unit tests exist for the parser and report merge; no API or integration tests are wired yet.

## Desired End State

- `DELETE /api/uploads/[id]` returns `{ success: true }` for the authenticated owner, deletes the upload row, the PDF object, and rebuilds the report.
- Dashboard `UploadHistory` shows a "Delete" button per upload, guarded by `window.confirm()` and using a client-side fetch.
- `rebuildReportFromExtractions` is a tested service that reconstructs the report from surviving `extractions` rows.
- `npm test` passes with new unit tests; `npm run lint` and `npm run build` stay green.

### Key Discoveries

- `extractions` rows are automatically removed by FK cascade when their parent `uploads` row is deleted; no explicit `extractions` DELETE is required.
- The stored report Markdown only appends sections; because there is no per-section metadata, the report must be rebuilt after an upload deletion rather than surgically edited.
- Storage deletion is best-effort: if it fails, the DB record is gone, so the orphaned object is invisible to the user through RLS but still consumes space.
- The upload pipeline remains append-only; report rebuilding is only triggered on delete.

## What We're NOT Doing

- Soft-delete / trash / undo.
- A separate "clear report" endpoint or UI button.
- Rebuilding the report on every upload (the append-only upload pipeline stays unchanged).
- Account deletion (handled by `auth.users` cascade).
- E2E or API integration tests (no test infrastructure exists yet).
- shadcn `AlertDialog` or other new UI dependencies (use native `confirm()`).

## Implementation Approach

Add a new `src/lib/services/deletes.ts` module with two responsibilities:
1. `deleteUpload` — orchestrate DB row deletion, Storage object removal, and report rebuild.
2. `buildReportFromExtractions` / `rebuildReportFromExtractions` — reconstruct the report from surviving `extractions.payload.items`.

Expose a new `DELETE /api/uploads/[id]` API route that follows the existing auth and JSON error pattern from `src/pages/api/upload.ts`. Wire a delete button into `src/components/dashboard/UploadHistory.tsx` using native `confirm()` and client-side fetch, and hydrate the component with `client:load` on `src/pages/dashboard.astro`.

## Critical Implementation Details

- **Deletion order:** DB row first, then Storage object, then report rebuild. If Storage fails, the DB record is already gone so the object is orphaned but inaccessible; log the error. If report rebuild fails, the upload is already deleted; log the error and return success to the user.
- **Report empty → delete row:** When no extractions remain for the user, `rebuildReportFromExtractions` deletes the `reports` row rather than leaving an empty row.
- **Date stability on rebuild:** `buildReportSection` falls back to today's date when an item has no parsed date. Rebuilding later may change null-date sections; this matches existing behavior and is acceptable for MVP.
- **Hydration:** `UploadHistory` currently renders server-side; add `client:load` to enable row-level click handlers.
- **RLS as guard:** All direct DB/Storage calls are scoped by `user_id` via RLS; the service still passes `userId` explicitly for defense in depth.

## Phase 1: Backend delete service and API route

### Overview

Implement the core delete service and expose it as `DELETE /api/uploads/[id]`.

### Changes Required:

#### 1. Delete service

**File**: `src/lib/services/deletes.ts`

**Intent**: Provide an orchestrated function that deletes an upload and its artifacts while rebuilding the report from remaining extractions.

**Contract**:
- `deleteUpload(supabase: SupabaseClient, userId: string, uploadId: string): Promise<void>`
  - Fetches the upload row to verify ownership and obtain `storage_path`.
  - Deletes the `uploads` row (FK cascade removes the linked `extractions` row).
  - Best-effort removes the Storage object from `lab-pdfs`.
  - Calls `rebuildReportFromExtractions`.
- `rebuildReportFromExtractions(supabase: SupabaseClient, userId: string): Promise<void>`
  - Queries remaining `extractions` for the user ordered by `created_at` ascending.
  - Builds the report via `buildReportFromExtractions`.
  - If the resulting content is empty, deletes the `reports` row.
  - Otherwise upserts the `reports` row with the new content.
- `buildReportFromExtractions(extractions: { payload: ExtractionPayload; created_at: string }[]): string`
  - Maps each extraction to a Markdown section via `buildReportSection` and joins with `\n\n`.
  - Skips empty sections.

```typescript
// Suggested signature shape
export async function deleteUpload(supabase: SupabaseClient, userId: string, uploadId: string): Promise<void>;
export async function rebuildReportFromExtractions(supabase: SupabaseClient, userId: string): Promise<void>;
export function buildReportFromExtractions(extractions: { payload: ExtractionPayload; created_at: string }[]): string;
```

#### 2. Delete API route

**File**: `src/pages/api/uploads/[id].ts`

**Intent**: Authenticated DELETE endpoint for an upload.

**Contract**:
- `export const prerender = false;`
- `DELETE: APIRoute` reads `context.params.id`.
- Checks `context.locals.user` and `createClient` (same pattern as `src/pages/api/upload.ts`).
- Returns:
  - `401` JSON `{ error: "Unauthorized" }` if not authenticated.
  - `400` JSON `{ error: "Upload id is required" }` if missing or invalid id.
  - `200` JSON `{ success: true }` after `deleteUpload` completes.
  - `500` JSON `{ error: message }` if `deleteUpload` throws (e.g., DB delete failure).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes on new files.
- `npm run build` passes.
- Type checking passes.

#### Manual Verification:

- `curl -X DELETE /api/uploads/<id>` for an owned upload returns `200` and the upload disappears.
- The Storage object is removed.
- The report is rebuilt or removed.
- Unauthorized requests return `401`.

## Phase 2: Report rebuild unit tests

### Overview

Add Vitest unit tests for the pure report rebuild logic.

### Changes Required:

#### 1. Unit tests

**File**: `tests/unit/deletes.test.ts`

**Intent**: Cover `buildReportFromExtractions` with deterministic extractions.

**Contract**:
- Empty extractions → `""`.
- Single extraction with items → one Markdown section.
- Multiple extractions → sections joined with `\n\n` in `created_at` order.
- Extraction with empty `items` → skipped.
- Items with `date: null` fall back to the mocked date in tests (use `vi.useFakeTimers`).

### Success Criteria:

#### Automated Verification:

- `npm test` passes.

#### Manual Verification:

- Review test output to confirm rebuild matches expected report shape.

## Phase 3: Dashboard UI delete buttons

### Overview

Add per-upload delete buttons to `UploadHistory` and hydrate the component.

### Changes Required:

#### 1. UploadHistory component

**File**: `src/components/dashboard/UploadHistory.tsx`

**Intent**: Add a delete button per row that calls `DELETE /api/uploads/[id]` after `confirm()`, then reloads the page.

**Contract**:
- Each row gets a red "Delete" button using the existing shadcn `Button` variant.
- Clicking triggers `window.confirm("Delete this upload? This cannot be undone.")`.
- On confirm, fetch `DELETE /api/uploads/${upload.id}` with `Content-Type: application/json`.
- On `200`, call `window.location.reload()`.
- On error, set local error state and display it above the list.
- Disable the button while a delete is in flight.

#### 2. Dashboard hydration

**File**: `src/pages/dashboard.astro`

**Intent**: Hydrate `UploadHistory` so row buttons work in the browser.

**Contract**:
- Change `<UploadHistory uploads={uploads} />` to `<UploadHistory uploads={uploads} client:load />`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification:

- Clicking Delete on an owned upload shows confirm, removes the upload, and updates the report.
- Report is removed when the last upload is deleted.
- Cancelling confirm leaves the upload intact.
- Network error shows an inline error message.

## Testing Strategy

### Unit Tests:

- `buildReportFromExtractions` with empty, single, and multiple extraction inputs.
- Date fallback behavior via `vi.useFakeTimers`.

### Integration Tests:

- Not in scope; no API/integration test harness exists yet.

### Manual Testing Steps:

1. Upload a PDF, verify report appears.
2. Upload a second PDF, verify report appends.
3. Delete the first upload; verify the second upload's section remains in the report.
4. Delete the second upload; verify the report disappears.
5. Cancel a delete confirm; verify nothing changes.

## Performance Considerations

- Report rebuild queries all user extractions and re-renders all sections. For the MVP (<100 uploads per user) this is acceptable. If volumes grow, consider persisting per-upload sections or caching.
- Rebuild is synchronous in the DELETE request; no queue is needed for MVP.

## Migration Notes

- No new SQL migrations are required; existing RLS and FK policies are sufficient.
- If a Storage object is orphaned due to a partial failure, it remains inaccessible because RLS scopes objects by `auth.uid()` folder.

## References

- `context/changes/user-delete/change.md`
- `src/pages/api/upload.ts`
- `src/lib/services/uploads.ts`
- `src/lib/services/reports.ts`
- `src/components/dashboard/UploadHistory.tsx`
- `src/pages/dashboard.astro`
- `supabase/migrations/20260527100000_create_core_schema.sql`
- `supabase/migrations/20260601100000_delete_rls_policies.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. See `references/progress-format.md`.

### Phase 1: Backend delete service and API route

#### Automated

- [x] 1.1 `npm run lint` passes — 7b05949
- [x] 1.2 `npm run build` passes — 7b05949

#### Manual

- [x] 1.3 `DELETE /api/uploads/<id>` returns `200` for an owned upload — 7b05949
- [x] 1.4 Storage object and extraction are removed after delete — 7b05949
- [x] 1.5 Report is rebuilt or removed after delete — 7b05949

### Phase 2: Report rebuild unit tests

#### Automated

- [x] 2.1 `npm test` passes with new unit tests

### Phase 3: Dashboard UI delete buttons

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` passes

#### Manual

- [ ] 3.3 Delete button with confirm removes the upload and refreshes the report
- [ ] 3.4 Last upload deletion removes the report
- [ ] 3.5 Cancelled confirm leaves the upload intact
