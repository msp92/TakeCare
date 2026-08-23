---
change_id: testing-upload-pipeline-integrity
title: Upload pipeline integrity
status: preparing
created: 2026-06-07
updated: 2026-06-07
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Upload pipeline integrity". Risks covered: #3 (upload partial success / cleanup), #5 (garbage extracted_text → clean 4xx), #6 (unauthenticated access to pages/APIs). Test types planned: integration (mocked Supabase). Risk response intent: #3 — prove any mid-upload failure leaves no succeeded record and persisted state matches failure; challenge HTTP success = all data persisted; avoid asserting only HTTP status. #5 — prove non-empty unprocessable input yields explicit predictable 4xx; challenge schema-valid ≠ processable; avoid testing only Zod-caught cases. #6 — prove page routes and API routes both deny unauthenticated access independently; challenge middleware test ≠ per-handler auth; avoid single middleware test standing in for all auth coverage.
