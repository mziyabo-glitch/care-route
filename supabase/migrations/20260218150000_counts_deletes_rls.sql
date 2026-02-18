-- Part B: is_agency_member helper for RLS policies.
create or replace function public.is_agency_member(p_agency_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.agency_members
    where user_id = auth.uid() and agency_id = p_agency_id
  );
$$;

revoke all on function public.is_agency_member(uuid) from public;
grant execute on function public.is_agency_member(uuid) to authenticated;

-- Part C: Soft delete - add deleted_at to clients (carers already has active).
alter table public.clients add column if not exists deleted_at timestamptz;

-- Ensure agency_id is not null (already should be).
alter table public.clients alter column agency_id set not null;
alter table public.carers alter column agency_id set not null;

-- Part B: Replace RLS policies to use is_agency_member.
drop policy if exists "clients_select" on public.clients;
create policy "clients_select"
on public.clients for select to authenticated
using (deleted_at is null and public.is_agency_member(agency_id));

drop policy if exists "clients_insert" on public.clients;
create policy "clients_insert"
on public.clients for insert to authenticated
with check (public.is_agency_member(agency_id));

drop policy if exists "clients_update" on public.clients;
create policy "clients_update"
on public.clients for update to authenticated
using (deleted_at is null and public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

drop policy if exists "clients_delete" on public.clients;
create policy "clients_delete"
on public.clients for delete to authenticated
using (deleted_at is null and public.is_agency_member(agency_id));

drop policy if exists "carers_select" on public.carers;
create policy "carers_select"
on public.carers for select to authenticated
using (public.is_agency_member(agency_id));

drop policy if exists "carers_insert" on public.carers;
create policy "carers_insert"
on public.carers for insert to authenticated
with check (public.is_agency_member(agency_id));

drop policy if exists "carers_update" on public.carers;
create policy "carers_update"
on public.carers for update to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

drop policy if exists "carers_delete" on public.carers;
create policy "carers_delete"
on public.carers for delete to authenticated
using (public.is_agency_member(agency_id));

drop policy if exists "visits_select" on public.visits;
create policy "visits_select"
on public.visits for select to authenticated
using (public.is_agency_member(agency_id));

drop policy if exists "visits_insert" on public.visits;
create policy "visits_insert"
on public.visits for insert to authenticated
with check (public.is_agency_member(agency_id));

drop policy if exists "visits_update" on public.visits;
create policy "visits_update"
on public.visits for update to authenticated
using (public.is_agency_member(agency_id))
with check (public.is_agency_member(agency_id));

drop policy if exists "visits_delete" on public.visits;
create policy "visits_delete"
on public.visits for delete to authenticated
using (public.is_agency_member(agency_id));

-- Part A: Count RPCs (bypass RLS recursion).
create or replace function public.count_clients(p_agency_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_count bigint;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select count(*)::bigint into v_count
  from public.clients
  where agency_id = p_agency_id and deleted_at is null;
  return v_count;
end;
$$;

create or replace function public.count_carers(p_agency_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_count bigint;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select count(*)::bigint into v_count
  from public.carers
  where agency_id = p_agency_id and coalesce(active, true) = true;
  return v_count;
end;
$$;

create or replace function public.count_visits(p_agency_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_count bigint;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select count(*)::bigint into v_count
  from public.visits
  where agency_id = p_agency_id;
  return v_count;
end;
$$;

revoke all on function public.count_clients(uuid) from public;
grant execute on function public.count_clients(uuid) to authenticated;
revoke all on function public.count_carers(uuid) from public;
grant execute on function public.count_carers(uuid) to authenticated;
revoke all on function public.count_visits(uuid) from public;
grant execute on function public.count_visits(uuid) to authenticated;

-- Update list_clients to exclude archived (deleted_at is not null).
create or replace function public.list_clients(p_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', coalesce(c.full_name, c.name),
      'address', c.address,
      'postcode', c.postcode,
      'notes', c.notes
    ) order by coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  into v_rows
  from public.clients c
  where c.agency_id = p_agency_id and c.deleted_at is null;
  return v_rows;
end;
$$;

-- Part C: Archive RPCs (soft delete) - bypass RLS for reliable updates.
create or replace function public.archive_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_agency_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select c.agency_id into v_agency_id
  from public.clients c
  where c.id = p_client_id and c.deleted_at is null;

  if v_agency_id is null then
    raise exception 'Client not found or already archived';
  end if;

  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;

  update public.clients
  set deleted_at = now()
  where id = p_client_id;
end;
$$;

create or replace function public.archive_carer(p_carer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_agency_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select c.agency_id into v_agency_id
  from public.carers c
  where c.id = p_carer_id;

  if v_agency_id is null then
    raise exception 'Carer not found';
  end if;

  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;

  update public.carers
  set active = false
  where id = p_carer_id;
end;
$$;

revoke all on function public.archive_client(uuid) from public;
grant execute on function public.archive_client(uuid) to authenticated;
revoke all on function public.archive_carer(uuid) from public;
grant execute on function public.archive_carer(uuid) to authenticated;
