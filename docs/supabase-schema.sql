-- Supabase schema for issue #3: shared referee directory sync.
-- Run this in a Supabase SQL migration after enabling Supabase Auth.
--
-- All authenticated users share one global referee list (Swedish Volleyball Federation).
-- Access control: sign in = full read/write access. No per-club scoping needed.

create table if not exists public.referees (
  id text primary key,
  name text not null,
  name_key text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create unique index if not exists referees_live_name
  on public.referees (name_key)
  where deleted_at is null;

alter table public.referees enable row level security;

create policy "authenticated users can read referees"
  on public.referees for select
  to authenticated
  using (true);

create policy "authenticated users can insert referees"
  on public.referees for insert
  to authenticated
  with check (true);

create policy "authenticated users can update referees"
  on public.referees for update
  to authenticated
  using (true)
  with check (true);
