-- S-01: DELETE policies for core tables and lab-pdfs storage (per-user scope)

create policy uploads_delete_own
  on public.uploads
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy extractions_delete_own
  on public.extractions
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy reports_delete_own
  on public.reports
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy lab_pdfs_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'lab-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
