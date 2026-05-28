-- F-01 Phase 2: row level security (DELETE policies deferred to S-01)

alter table public.uploads enable row level security;
alter table public.extractions enable row level security;
alter table public.reports enable row level security;

-- uploads
create policy uploads_select_own
  on public.uploads
  for select
  to authenticated
  using (user_id = auth.uid());

create policy uploads_insert_own
  on public.uploads
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy uploads_update_own
  on public.uploads
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- extractions
create policy extractions_select_own
  on public.extractions
  for select
  to authenticated
  using (user_id = auth.uid());

create policy extractions_insert_own
  on public.extractions
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy extractions_update_own
  on public.extractions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- reports
create policy reports_select_own
  on public.reports
  for select
  to authenticated
  using (user_id = auth.uid());

create policy reports_insert_own
  on public.reports
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy reports_update_own
  on public.reports
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- TODO(S-01): DELETE policies + Storage object cleanup
