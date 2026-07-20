-- Supabase schema for issue #3: shared referee directory sync.
-- Run this in a Supabase SQL migration after enabling Supabase Auth.
--
-- All authenticated users share one global referee list (Swedish Volleyball Federation).
-- Access control: sign in = full read/write access. No per-club scoping needed.

-- ============================================================
-- Issue #9: Cloud tournament storage
-- ============================================================

-- profiles: bridges auth.users.email → id so email-based invites work before the invitee signs up.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null
);

alter table public.profiles enable row level security;

create policy "authenticated users can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

-- tournaments: one row per tournament; serialized graph stored in jsonb.
create table if not exists public.tournaments (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;

-- Owner or co-editor can read.
create policy "tournament owners and editors can read"
  on public.tournaments for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.tournament_editors te
      where te.tournament_id = id
        and te.editor_user_id = auth.uid()
    )
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
  using (
    exists (
      select 1 from public.tournament_editors te
      where te.tournament_id = id
        and te.editor_user_id = auth.uid()
    )
  )
  with check (
    -- co-editors may not change owner_id or status
    owner_id = (select owner_id from public.tournaments t2 where t2.id = id)
    and status  = (select status  from public.tournaments t2 where t2.id = id)
  );

create policy "tournament owners can delete"
  on public.tournaments for delete
  to authenticated
  using (owner_id = auth.uid());

-- tournament_editors: co-editor grants keyed by email (pending invites supported).
create table if not exists public.tournament_editors (
  tournament_id text not null references public.tournaments(id) on delete cascade,
  invited_email text not null,
  editor_user_id uuid references auth.users(id) on delete cascade,
  primary key (tournament_id, invited_email)
);

alter table public.tournament_editors enable row level security;

create policy "tournament owners can manage editors"
  on public.tournament_editors for all
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.owner_id = auth.uid()
    )
  );

-- Co-editors can read the editor list for tournaments they have access to.
create policy "tournament editors can read editors"
  on public.tournament_editors for select
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and (
          t.owner_id = auth.uid()
          or exists (
            select 1 from public.tournament_editors te2
            where te2.tournament_id = t.id
              and te2.editor_user_id = auth.uid()
          )
        )
    )
  );

-- Trigger: insert into profiles on new sign-up; backfill tournament_editors.editor_user_id for any
-- pending invite that matches the new user's email. Must be created AFTER tournament_editors exists.
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
