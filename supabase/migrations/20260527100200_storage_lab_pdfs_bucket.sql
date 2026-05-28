-- F-01 Phase 3: private PDF bucket (DELETE policies deferred to S-01)
-- Object key convention: {user_id}/{upload_id}.pdf (matches public.uploads.storage_path)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lab-pdfs',
  'lab-pdfs',
  false,
  52428800, -- 50MiB (aligned with supabase/config.toml file_size_limit)
  array['application/pdf']
);

-- Expected policy behavior (authenticated):
-- ALLOW: SELECT/INSERT/UPDATE on lab-pdfs/{auth.uid()}/...
-- DENY:  SELECT/INSERT/UPDATE on lab-pdfs/{other_user_id}/...

create policy lab_pdfs_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'lab-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy lab_pdfs_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'lab-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy lab_pdfs_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'lab-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'lab-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- TODO(S-01): DELETE policy on storage.objects for lab-pdfs + table DELETE policies
