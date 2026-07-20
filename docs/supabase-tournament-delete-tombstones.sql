-- Migration: durable cloud tournament delete tombstones
--
-- Purpose:
-- 1) preserve deleted tournament ids per owner
-- 2) prevent stale local copies from being re-uploaded on later sign-in
--
-- Safe to run multiple times.

begin;

create table if not exists public.tournament_tombstones (
  tournament_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  deleted_at timestamptz not null default now()
);

alter table public.tournament_tombstones enable row level security;

drop policy if exists "users can read own tournament tombstones" on public.tournament_tombstones;
create policy "users can read own tournament tombstones"
  on public.tournament_tombstones for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "users can write own tournament tombstones" on public.tournament_tombstones;
create policy "users can write own tournament tombstones"
  on public.tournament_tombstones for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

commit;
