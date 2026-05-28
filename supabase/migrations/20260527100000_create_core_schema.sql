-- F-01 Phase 1: core tables (RLS policies in 20260527100100_enable_rls_policies.sql)

create type public.upload_status as enum (
  'pending',
  'processing',
  'succeeded',
  'failed'
);

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  original_filename text,
  status public.upload_status not null default 'pending',
  facility_template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.extractions (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null unique references public.uploads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.reports (
  user_id uuid primary key references auth.users (id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);

create index uploads_user_id_created_at_idx
  on public.uploads (user_id, created_at desc);

create index extractions_user_id_idx
  on public.extractions (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger uploads_set_updated_at
  before update on public.uploads
  for each row
  execute function public.set_updated_at();
