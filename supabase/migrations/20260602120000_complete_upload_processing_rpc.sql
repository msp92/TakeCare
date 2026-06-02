-- Atomic extraction + report merge + upload success (impl-review F2 Fix A)

create or replace function public.complete_upload_processing(
  p_upload_id uuid,
  p_payload jsonb,
  p_report_section text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_content text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_report_section is null or length(trim(p_report_section)) = 0 then
    raise exception 'report section must not be empty';
  end if;

  if not exists (
    select 1
    from public.uploads
    where id = p_upload_id
      and user_id = v_user_id
      and status = 'processing'
  ) then
    raise exception 'upload not found or not in processing state';
  end if;

  insert into public.extractions (upload_id, user_id, payload)
  values (p_upload_id, v_user_id, p_payload);

  insert into public.reports (user_id, content)
  values (v_user_id, p_report_section)
  on conflict (user_id) do update
  set
    content = case
      when trim(public.reports.content) = '' then excluded.content
      else public.reports.content || E'\n\n' || excluded.content
    end,
    updated_at = now();

  update public.uploads
  set status = 'succeeded'
  where id = p_upload_id
    and user_id = v_user_id;

  select r.content
  into v_content
  from public.reports as r
  where r.user_id = v_user_id;

  return v_content;
end;
$$;

grant execute on function public.complete_upload_processing(uuid, jsonb, text) to authenticated;
