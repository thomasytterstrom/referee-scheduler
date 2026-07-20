-- Supabase schema for issue #3: shared referee directory sync.
-- Run this in a Supabase SQL migration after enabling Supabase Auth.
--
-- All authenticated users share one global referee list (Swedish Volleyball Federation).
-- Access control: sign in = full read/write access. No per-club scoping needed.

-- ============================================================
-- Issue #9: Cloud tournament storage
-- Tables must all be created before any cross-referencing RLS policies.
-- ============================================================

-- Step 1: tables

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null
);

create table if not exists public.tournaments (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- tournament_editors must exist before any policy that references it is created.
create table if not exists public.tournament_editors (
  tournament_id text not null references public.tournaments(id) on delete cascade,
  invited_email text not null,
  editor_user_id uuid references auth.users(id) on delete cascade,
  primary key (tournament_id, invited_email)
);

-- Durable delete markers so previously deleted tournament ids cannot be re-uploaded
-- from stale local IndexedDB copies on another device.
create table if not exists public.tournament_tombstones (
  tournament_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  deleted_at timestamptz not null default now()
);

-- Step 2: enable RLS

alter table public.profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_editors enable row level security;
alter table public.tournament_tombstones enable row level security;

-- Helper predicates run as the function owner so policy checks do not recurse through RLS.
create or replace function public.is_tournament_owner(check_tournament_id text, check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournaments t
    where t.id = check_tournament_id
      and t.owner_id = check_user_id
  );
$$;

create or replace function public.is_tournament_editor(check_tournament_id text, check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_editors te
    where te.tournament_id = check_tournament_id
      and te.editor_user_id = check_user_id
  );
$$;

create or replace function public.can_tournament_editor_update(
  check_tournament_id text,
  check_user_id uuid,
  next_owner_id uuid,
  next_status text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_editors te
    join public.tournaments t on t.id = te.tournament_id
    where te.tournament_id = check_tournament_id
      and te.editor_user_id = check_user_id
      and t.owner_id = next_owner_id
      and t.status = next_status
  );
$$;

-- Step 3: policies (all tables exist now, cross-references are safe)

create policy "authenticated users can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "tournament owners and editors can read"
  on public.tournaments for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_tournament_editor(id, auth.uid())
  );

create policy "tournament owners can insert"
  on public.tournaments for insert
  to authenticated
  with check (owner_id = auth.uid());

-- Owner can update anything; co-editor can only update data + updated_at.
create policy "tournament owners can update"
  on public.tournaments for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "tournament editors can update data"
  on public.tournaments for update
  to authenticated
  using (public.is_tournament_editor(id, auth.uid()))
  with check (
    public.can_tournament_editor_update(id, auth.uid(), owner_id, status)
  );

create policy "tournament owners can delete"
  on public.tournaments for delete
  to authenticated
  using (owner_id = auth.uid());

create policy "tournament owners can manage editors"
  on public.tournament_editors for all
  to authenticated
  using (public.is_tournament_owner(tournament_id, auth.uid()))
  with check (public.is_tournament_owner(tournament_id, auth.uid()));

create policy "users can read own tournament tombstones"
  on public.tournament_tombstones for select
  to authenticated
  using (owner_id = auth.uid());

create policy "users can write own tournament tombstones"
  on public.tournament_tombstones for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Co-editors can read the editor list for tournaments they have access to.
create policy "tournament editors can read editors"
  on public.tournament_editors for select
  to authenticated
  using (
    public.is_tournament_owner(tournament_id, auth.uid())
    or public.is_tournament_editor(tournament_id, auth.uid())
  );

-- Step 4: trigger (after tournament_editors exists)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  update public.tournament_editors
  set editor_user_id = new.id
  where invited_email = new.email
    and editor_user_id is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================

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
