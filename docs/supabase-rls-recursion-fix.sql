-- Minimal migration for existing databases:
-- fixes infinite recursion in RLS policies for public.tournaments.
--
-- Safe to run multiple times.

begin;

-- Helper predicates run as function owner to avoid recursive RLS evaluation.
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

-- Ensure authenticated users can execute helper functions when RLS evaluates policies.
grant execute on function public.is_tournament_owner(text, uuid) to authenticated;
grant execute on function public.is_tournament_editor(text, uuid) to authenticated;
grant execute on function public.can_tournament_editor_update(text, uuid, uuid, text) to authenticated;

-- Replace only the policies involved in the recursion cycle.
drop policy if exists "tournament owners and editors can read" on public.tournaments;
create policy "tournament owners and editors can read"
  on public.tournaments for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_tournament_editor(id, auth.uid())
  );

drop policy if exists "tournament editors can update data" on public.tournaments;
create policy "tournament editors can update data"
  on public.tournaments for update
  to authenticated
  using (public.is_tournament_editor(id, auth.uid()))
  with check (public.can_tournament_editor_update(id, auth.uid(), owner_id, status));

drop policy if exists "tournament owners can manage editors" on public.tournament_editors;
create policy "tournament owners can manage editors"
  on public.tournament_editors for all
  to authenticated
  using (public.is_tournament_owner(tournament_id, auth.uid()))
  with check (public.is_tournament_owner(tournament_id, auth.uid()));

drop policy if exists "tournament editors can read editors" on public.tournament_editors;
create policy "tournament editors can read editors"
  on public.tournament_editors for select
  to authenticated
  using (
    public.is_tournament_owner(tournament_id, auth.uid())
    or public.is_tournament_editor(tournament_id, auth.uid())
  );

commit;
