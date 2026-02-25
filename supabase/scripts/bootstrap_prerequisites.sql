-- BOOTSTRAP: Run this file FIRST in Supabase SQL Editor if you have a fresh database.
-- Then run 20260224000000_visit_actuals_payroll.sql

-- ========== 20260217213000_multi_tenant_agencies.sql ==========
create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (agency_id, user_id)
);

alter table public.agencies
  add column if not exists name text,
  add column if not exists created_by uuid references auth.users (id) on delete cascade,
  add column if not exists created_at timestamptz not null default now();

alter table public.agency_members
  add column if not exists agency_id uuid references public.agencies (id) on delete cascade,
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists role text not null default 'owner',
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agency_members_agency_id_user_id_key'
      and conrelid = 'public.agency_members'::regclass
  ) then
    alter table public.agency_members
      add constraint agency_members_agency_id_user_id_key unique (agency_id, user_id);
  end if;
end
$$;

create index if not exists idx_agency_members_user_id on public.agency_members (user_id);
create index if not exists idx_agency_members_agency_id on public.agency_members (agency_id);

alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;

drop policy if exists "agencies_select_for_members" on public.agencies;
create policy "agencies_select_for_members"
on public.agencies
for select
to authenticated
using (
  exists (
    select 1
    from public.agency_members am
    where am.agency_id = agencies.id
      and am.user_id = auth.uid()
  )
);

drop policy if exists "agencies_insert_authenticated" on public.agencies;
create policy "agencies_insert_authenticated"
on public.agencies
for insert
to authenticated
with check (
  auth.uid() is not null
  and coalesce(created_by, auth.uid()) = auth.uid()
);

drop policy if exists "agency_members_select_own" on public.agency_members;
create policy "agency_members_select_own"
on public.agency_members
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "agency_members_insert_own" on public.agency_members;
create policy "agency_members_insert_own"
on public.agency_members
for insert
to authenticated
with check (user_id = auth.uid());


-- ========== 20260217223000_fix_agency_rls_recursion.sql ==========
alter table public.agencies
  add column if not exists owner_id uuid;

-- Backfill owner_id from created_by where possible.
update public.agencies
set owner_id = created_by
where owner_id is null
  and created_by is not null;

-- Remove orphan agencies that have no identifiable owner at all.
-- These are leftover rows with both owner_id and created_by NULL.
delete from public.agencies
where owner_id is null;

alter table public.agencies
  alter column owner_id set default auth.uid();

alter table public.agencies
  alter column owner_id set not null;

alter table public.agencies enable row level security;

drop policy if exists "Insert own agency" on public.agencies;
drop policy if exists "Select own agencies" on public.agencies;
drop policy if exists "Update own agencies" on public.agencies;
drop policy if exists "agencies_insert_authenticated" on public.agencies;
drop policy if exists "agencies_select_for_members" on public.agencies;

create policy "Insert own agency"
on public.agencies
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Select own agencies"
on public.agencies
for select
to authenticated
using (owner_id = auth.uid());

create policy "Update own agencies"
on public.agencies
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create or replace function public.create_agency_and_membership(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_name text;
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'Agency name is required';
  end if;

  insert into public.agencies (name, owner_id, created_by)
  values (v_name, v_user_id, v_user_id)
  returning id into v_agency_id;

  insert into public.agency_members (agency_id, user_id, role)
  values (v_agency_id, v_user_id, 'owner')
  on conflict (agency_id, user_id) do nothing;

  return v_agency_id;
end;
$$;

revoke all on function public.create_agency_and_membership(text) from public;
grant execute on function public.create_agency_and_membership(text) to authenticated;


-- ========== 20260218000000_clients_carers_visits.sql ==========
-- Allow agency members (not just owners) to select their agencies.
drop policy if exists "Select agencies for members" on public.agencies;
create policy "Select agencies for members"
on public.agencies for select to authenticated
using (
  id in (select agency_id from public.agency_members where user_id = auth.uid())
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.carers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  carer_id uuid not null references public.carers (id) on delete cascade,
  start_time timestamptz not null default now(),
  end_time timestamptz not null default (now() + interval '1 hour'),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'missed')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_clients_agency_id on public.clients (agency_id);
create index if not exists idx_carers_agency_id on public.carers (agency_id);
create index if not exists idx_visits_agency_id on public.visits (agency_id);
create index if not exists idx_visits_client_id on public.visits (client_id);
create index if not exists idx_visits_carer_id on public.visits (carer_id);
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visits'
      and column_name = 'scheduled_at'
  ) then
    create index if not exists idx_visits_scheduled_at on public.visits (scheduled_at);
  end if;
end $$;

alter table public.clients enable row level security;
alter table public.carers enable row level security;
alter table public.visits enable row level security;

-- RLS: membership check via agency_members only (no agencies) to avoid recursion.
drop policy if exists "clients_select" on public.clients;
create policy "clients_select"
on public.clients for select to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

drop policy if exists "clients_insert" on public.clients;
create policy "clients_insert"
on public.clients for insert to authenticated
with check (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

drop policy if exists "clients_update" on public.clients;
create policy "clients_update"
on public.clients for update to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
)
with check (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

drop policy if exists "clients_delete" on public.clients;
create policy "clients_delete"
on public.clients for delete to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

drop policy if exists "carers_select" on public.carers;
create policy "carers_select"
on public.carers for select to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

drop policy if exists "carers_insert" on public.carers;
create policy "carers_insert"
on public.carers for insert to authenticated
with check (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

drop policy if exists "carers_update" on public.carers;
create policy "carers_update"
on public.carers for update to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
)
with check (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

drop policy if exists "carers_delete" on public.carers;
create policy "carers_delete"
on public.carers for delete to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

drop policy if exists "visits_select" on public.visits;
create policy "visits_select"
on public.visits for select to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

drop policy if exists "visits_insert" on public.visits;
create policy "visits_insert"
on public.visits for insert to authenticated
with check (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

drop policy if exists "visits_update" on public.visits;
create policy "visits_update"
on public.visits for update to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
)
with check (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

drop policy if exists "visits_delete" on public.visits;
create policy "visits_delete"
on public.visits for delete to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);


-- ========== 20260218100000_clients_address_notes.sql ==========
alter table public.clients
  add column if not exists address text,
  add column if not exists postcode text,
  add column if not exists notes text;


-- ========== 20260218110000_carers_role_active.sql ==========
alter table public.carers
  add column if not exists role text,
  add column if not exists active boolean default true;


-- ========== 20260218120000_carers_insert_rpc.sql ==========
-- Support both name and full_name (production may use either).
alter table public.carers add column if not exists full_name text;
alter table public.carers add column if not exists name text;
update public.carers set full_name = name where full_name is null and name is not null;
update public.carers set name = full_name where name is null and full_name is not null;

create or replace function public.insert_carer(
  p_agency_id uuid,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_role text default null,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_carer_id uuid;
  v_row jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Name is required';
  end if;

  if not exists (
    select 1 from public.agency_members
    where user_id = v_user_id and agency_id = p_agency_id
  ) then
    raise exception 'Not authorized for this agency';
  end if;

  insert into public.carers (agency_id, full_name, name, email, phone, role, active)
  values (
    p_agency_id,
    trim(p_name),
    trim(p_name),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_role, '')), ''),
    coalesce(p_active, true)
  )
  returning id into v_carer_id;

  select jsonb_build_object(
    'id', c.id,
    'name', coalesce(c.full_name, c.name),
    'email', c.email,
    'phone', c.phone,
    'role', c.role,
    'active', c.active
  ) into v_row
  from public.carers c
  where c.id = v_carer_id;

  return v_row;
end;
$$;

revoke all on function public.insert_carer(uuid, text, text, text, text, boolean) from public;
grant execute on function public.insert_carer(uuid, text, text, text, text, boolean) to authenticated;


-- ========== 20260218133000_clients_insert_rpc.sql ==========
-- Insert client via SECURITY DEFINER to avoid RLS recursion/stack depth issues.
-- Also ensures expected columns exist for compatibility.

-- Support both name and full_name (production may use either).
alter table public.clients add column if not exists full_name text;
alter table public.clients add column if not exists name text;
alter table public.clients add column if not exists address text;
alter table public.clients add column if not exists postcode text;
alter table public.clients add column if not exists notes text;

update public.clients set full_name = name where full_name is null and name is not null;
update public.clients set name = full_name where name is null and full_name is not null;

create or replace function public.insert_client(
  p_agency_id uuid,
  p_name text,
  p_address text default null,
  p_postcode text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_client_id uuid;
  v_row jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Name is required';
  end if;

  if not exists (
    select 1 from public.agency_members
    where user_id = v_user_id and agency_id = p_agency_id
  ) then
    raise exception 'Not authorized for this agency';
  end if;

  insert into public.clients (agency_id, full_name, name, address, postcode, notes)
  values (
    p_agency_id,
    trim(p_name),
    trim(p_name),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_postcode, '')), ''),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_client_id;

  select jsonb_build_object(
    'id', c.id,
    'name', coalesce(c.full_name, c.name),
    'address', c.address,
    'postcode', c.postcode,
    'notes', c.notes
  ) into v_row
  from public.clients c
  where c.id = v_client_id;

  return v_row;
end;
$$;

revoke all on function public.insert_client(uuid, text, text, text, text) from public;
grant execute on function public.insert_client(uuid, text, text, text, text) to authenticated;



-- ========== 20260218140000_list_rpcs.sql ==========
-- SECURITY DEFINER list functions to bypass RLS recursion on SELECT.

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

  if not exists (
    select 1 from public.agency_members
    where user_id = v_user_id and agency_id = p_agency_id
  ) then
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
  where c.agency_id = p_agency_id;

  return v_rows;
end;
$$;

revoke all on function public.list_clients(uuid) from public;
grant execute on function public.list_clients(uuid) to authenticated;

create or replace function public.list_carers(p_agency_id uuid)
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

  if not exists (
    select 1 from public.agency_members
    where user_id = v_user_id and agency_id = p_agency_id
  ) then
    raise exception 'Not authorized for this agency';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', coalesce(c.full_name, c.name),
      'email', c.email,
      'phone', c.phone,
      'role', c.role,
      'active', c.active
    ) order by coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  into v_rows
  from public.carers c
  where c.agency_id = p_agency_id;

  return v_rows;
end;
$$;

revoke all on function public.list_carers(uuid) from public;
grant execute on function public.list_carers(uuid) to authenticated;


-- ========== 20260218150000_counts_deletes_rls.sql ==========
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


-- ========== 20260218160000_visits_schema_rpcs.sql ==========
-- Visits schema: start_time, end_time, status (scheduled|completed|missed), FKs on delete restrict.
-- Only migrate if visits is a base table with the legacy scheduled_at column.

do $$
begin
  -- Guard: only run migration when visits is a BASE TABLE (not a view)
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'visits' and table_type = 'BASE TABLE'
  ) then
    return;
  end if;

  -- Add new columns if migrating from scheduled_at
  alter table public.visits add column if not exists start_time timestamptz;
  alter table public.visits add column if not exists end_time timestamptz;

  -- Migrate existing data: scheduled_at -> start_time, end_time
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'visits' and column_name = 'scheduled_at'
  ) then
    update public.visits
    set start_time = scheduled_at,
        end_time = scheduled_at + interval '1 hour'
    where start_time is null and scheduled_at is not null;
    alter table public.visits drop column scheduled_at;
  end if;

  -- Backfill any remaining nulls
  update public.visits
  set start_time = coalesce(start_time, now()),
      end_time = coalesce(end_time, now() + interval '1 hour')
  where start_time is null or end_time is null;

  -- Set not null
  alter table public.visits alter column start_time set not null;
  alter table public.visits alter column end_time set not null;

  -- Update status constraint: scheduled, completed, missed (map cancelled -> missed)
  update public.visits set status = 'missed' where status = 'cancelled';
  alter table public.visits drop constraint if exists visits_status_check;
  alter table public.visits add constraint visits_status_check
    check (status in ('scheduled', 'completed', 'missed'));

  -- Change FKs to ON DELETE RESTRICT
  alter table public.visits drop constraint if exists visits_client_id_fkey;
  alter table public.visits add constraint visits_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete restrict;

  alter table public.visits drop constraint if exists visits_carer_id_fkey;
  alter table public.visits add constraint visits_carer_id_fkey
    foreign key (carer_id) references public.carers(id) on delete restrict;
end $$;

-- Indexes
drop index if exists public.idx_visits_scheduled_at;
create index if not exists idx_visits_start_time on public.visits (start_time);
create index if not exists idx_visits_agency_id on public.visits (agency_id);
create index if not exists idx_visits_client_id on public.visits (client_id);
create index if not exists idx_visits_carer_id on public.visits (carer_id);

-- list_visits: returns visits with client_name, carer_name, ordered by start_time desc
create or replace function public.list_visits(p_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'client_id', v.client_id,
      'carer_id', v.carer_id,
      'client_name', coalesce(c.full_name, c.name),
      'carer_name', coalesce(cr.full_name, cr.name),
      'start_time', v.start_time,
      'end_time', v.end_time,
      'status', v.status,
      'notes', v.notes
    ) order by v.start_time desc
  ), '[]'::jsonb)
  into v_rows
  from public.visits v
  left join public.clients c on c.id = v.client_id and c.deleted_at is null
  left join public.carers cr on cr.id = v.carer_id
  where v.agency_id = p_agency_id;
  return v_rows;
end;
$$;

revoke all on function public.list_visits(uuid) from public;
grant execute on function public.list_visits(uuid) to authenticated;

-- list_clients_for_selection: id, name for active (non-archived) clients
create or replace function public.list_clients_for_selection(p_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object('id', c.id, 'name', coalesce(c.full_name, c.name))
    order by coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  into v_rows
  from public.clients c
  where c.agency_id = p_agency_id and c.deleted_at is null;
  return v_rows;
end;
$$;

revoke all on function public.list_clients_for_selection(uuid) from public;
grant execute on function public.list_clients_for_selection(uuid) to authenticated;

-- list_carers_for_selection: id, name for active carers only
create or replace function public.list_carers_for_selection(p_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object('id', c.id, 'name', coalesce(c.full_name, c.name))
    order by coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  into v_rows
  from public.carers c
  where c.agency_id = p_agency_id and coalesce(c.active, true) = true;
  return v_rows;
end;
$$;

revoke all on function public.list_carers_for_selection(uuid) from public;
grant execute on function public.list_carers_for_selection(uuid) to authenticated;

-- insert_visit
create or replace function public.insert_visit(
  p_agency_id uuid,
  p_client_id uuid,
  p_carer_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_status text default 'scheduled',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_id uuid; v_row jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  if p_status is null or p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;
  if p_end_time < p_start_time then
    raise exception 'End time must be after start time';
  end if;
  insert into public.visits (agency_id, client_id, carer_id, start_time, end_time, status, notes)
  values (p_agency_id, p_client_id, p_carer_id, p_start_time, p_end_time, p_status, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_id;
  select jsonb_build_object(
    'id', vi.id, 'client_id', vi.client_id, 'carer_id', vi.carer_id,
    'start_time', vi.start_time, 'end_time', vi.end_time, 'status', vi.status, 'notes', vi.notes
  ) into v_row
  from public.visits vi where vi.id = v_id;
  return v_row;
end;
$$;

revoke all on function public.insert_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text) from public;
grant execute on function public.insert_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;

-- update_visit_status
create or replace function public.update_visit_status(p_visit_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_agency_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if p_status is null or p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;
  select v.agency_id into v_agency_id from public.visits v where v.id = p_visit_id;
  if v_agency_id is null then raise exception 'Visit not found'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  update public.visits set status = p_status where id = p_visit_id;
end;
$$;

revoke all on function public.update_visit_status(uuid, text) from public;
grant execute on function public.update_visit_status(uuid, text) to authenticated;

-- delete_visit (hard delete)
create or replace function public.delete_visit(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_agency_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select v.agency_id into v_agency_id from public.visits v where v.id = p_visit_id;
  if v_agency_id is null then raise exception 'Visit not found'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  delete from public.visits where id = p_visit_id;
end;
$$;

revoke all on function public.delete_visit(uuid) from public;
grant execute on function public.delete_visit(uuid) to authenticated;

-- count_visits_today
create or replace function public.count_visits_today(p_agency_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_count bigint;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select count(*)::bigint into v_count
  from public.visits
  where agency_id = p_agency_id
    and (start_time at time zone 'UTC')::date = (current_timestamp at time zone 'UTC')::date;
  return v_count;
end;
$$;

revoke all on function public.count_visits_today(uuid) from public;
grant execute on function public.count_visits_today(uuid) to authenticated;


-- ========== 20260218170000_rota_list_visits_for_week.sql ==========
-- list_visits_for_week: visits in [p_week_start, p_week_end), with client/carer names.
create or replace function public.list_visits_for_week(
  p_agency_id uuid,
  p_week_start timestamptz,
  p_week_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'client_id', v.client_id,
      'carer_id', v.carer_id,
      'client_name', coalesce(c.full_name, c.name),
      'carer_name', coalesce(cr.full_name, cr.name),
      'start_time', v.start_time,
      'end_time', v.end_time,
      'status', v.status,
      'notes', v.notes
    ) order by v.start_time
  ), '[]'::jsonb)
  into v_rows
  from public.visits v
  left join public.clients c on c.id = v.client_id and c.deleted_at is null
  left join public.carers cr on cr.id = v.carer_id
  where v.agency_id = p_agency_id
    and v.start_time >= p_week_start
    and v.start_time < p_week_end;
  return v_rows;
end;
$$;

revoke all on function public.list_visits_for_week(uuid, timestamptz, timestamptz) from public;
grant execute on function public.list_visits_for_week(uuid, timestamptz, timestamptz) to authenticated;


-- ========== 20260218180000_visit_conflict_check.sql ==========
-- Visit conflict detection: carer cannot have overlapping visits.

-- insert_visit: check for overlapping visits before insert
create or replace function public.insert_visit(
  p_agency_id uuid,
  p_client_id uuid,
  p_carer_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_status text default 'scheduled',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_id uuid; v_row jsonb; v_conflict boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  if p_status is null or p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;
  if p_end_time < p_start_time then
    raise exception 'End time must be after start time';
  end if;

  select exists (
    select 1 from public.visits v
    where v.carer_id = p_carer_id
      and v.agency_id = p_agency_id
      and v.start_time < p_end_time
      and v.end_time > p_start_time
  ) into v_conflict;
  if v_conflict then
    raise exception 'Carer already has a visit during this time.';
  end if;

  insert into public.visits (agency_id, client_id, carer_id, start_time, end_time, status, notes)
  values (p_agency_id, p_client_id, p_carer_id, p_start_time, p_end_time, p_status, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_id;
  select jsonb_build_object(
    'id', vi.id, 'client_id', vi.client_id, 'carer_id', vi.carer_id,
    'start_time', vi.start_time, 'end_time', vi.end_time, 'status', vi.status, 'notes', vi.notes
  ) into v_row
  from public.visits vi where vi.id = v_id;
  return v_row;
end;
$$;

-- update_visit: full update with overlap check (exclude current visit)
create or replace function public.update_visit(
  p_visit_id uuid,
  p_client_id uuid,
  p_carer_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_status text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_agency_id uuid; v_conflict boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select v.agency_id into v_agency_id from public.visits v where v.id = p_visit_id;
  if v_agency_id is null then raise exception 'Visit not found'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  if p_end_time < p_start_time then
    raise exception 'End time must be after start time';
  end if;
  if p_status is not null and p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;

  select exists (
    select 1 from public.visits v
    where v.carer_id = p_carer_id
      and v.agency_id = v_agency_id
      and v.id != p_visit_id
      and v.start_time < p_end_time
      and v.end_time > p_start_time
  ) into v_conflict;
  if v_conflict then
    raise exception 'Carer already has a visit during this time.';
  end if;

  update public.visits
  set client_id = p_client_id,
      carer_id = p_carer_id,
      start_time = p_start_time,
      end_time = p_end_time,
      status = coalesce(p_status, status),
      notes = case when p_notes is not null then p_notes else notes end
  where id = p_visit_id;
end;
$$;

revoke all on function public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text) from public;
grant execute on function public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;


-- ========== 20260218190000_visit_assignments.sql ==========
-- PART A: visit_assignments for joint (paired) visits.

-- Ensure clients.postcode exists
alter table public.clients add column if not exists postcode text;

create table if not exists public.visit_assignments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  carer_id uuid not null references public.carers(id) on delete restrict,
  role text not null default 'primary' check (role in ('primary', 'secondary')),
  created_at timestamptz default now(),
  unique (visit_id, carer_id)
);

create index if not exists idx_visit_assignments_agency_visit on public.visit_assignments (agency_id, visit_id);
create index if not exists idx_visit_assignments_agency_carer on public.visit_assignments (agency_id, carer_id);

alter table public.visit_assignments enable row level security;

drop policy if exists "visit_assignments_select" on public.visit_assignments;
create policy "visit_assignments_select" on public.visit_assignments for select to authenticated
using (public.is_agency_member(agency_id));

drop policy if exists "visit_assignments_insert" on public.visit_assignments;
create policy "visit_assignments_insert" on public.visit_assignments for insert to authenticated
with check (public.is_agency_member(agency_id));

drop policy if exists "visit_assignments_update" on public.visit_assignments;
create policy "visit_assignments_update" on public.visit_assignments for update to authenticated
using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));

drop policy if exists "visit_assignments_delete" on public.visit_assignments;
create policy "visit_assignments_delete" on public.visit_assignments for delete to authenticated
using (public.is_agency_member(agency_id));

-- Backfill: create primary assignment for existing visits
insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
select agency_id, id, carer_id, 'primary'
from public.visits
where carer_id is not null
  and not exists (select 1 from public.visit_assignments va where va.visit_id = visits.id and va.carer_id = visits.carer_id);


-- ========== 20260218190000_visit_assignments_travel.sql ==========
-- PART A: visit_assignments for joint (paired) visits

create table if not exists public.visit_assignments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  carer_id uuid not null references public.carers(id) on delete restrict,
  role text not null default 'primary' check (role in ('primary', 'secondary')),
  created_at timestamptz default now(),
  unique(visit_id, carer_id)
);

create index if not exists idx_visit_assignments_agency_visit on public.visit_assignments (agency_id, visit_id);
create index if not exists idx_visit_assignments_agency_carer on public.visit_assignments (agency_id, carer_id);

alter table public.visit_assignments enable row level security;

drop policy if exists "visit_assignments_select" on public.visit_assignments;
create policy "visit_assignments_select" on public.visit_assignments for select to authenticated
using (public.is_agency_member(agency_id));

drop policy if exists "visit_assignments_insert" on public.visit_assignments;
create policy "visit_assignments_insert" on public.visit_assignments for insert to authenticated
with check (public.is_agency_member(agency_id));

drop policy if exists "visit_assignments_update" on public.visit_assignments;
create policy "visit_assignments_update" on public.visit_assignments for update to authenticated
using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));

drop policy if exists "visit_assignments_delete" on public.visit_assignments;
create policy "visit_assignments_delete" on public.visit_assignments for delete to authenticated
using (public.is_agency_member(agency_id));

-- Backfill from existing visits
insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
select agency_id, id, carer_id, 'primary'
from public.visits
where carer_id is not null
  and not exists (select 1 from public.visit_assignments va where va.visit_id = visits.id and va.carer_id = visits.carer_id);

-- PART D: estimateTravelMinutes (outward code heuristic, no external API)
create or replace function public.estimate_travel_minutes(p_postcode_a text, p_postcode_b text)
returns int
language plpgsql
immutable
as $$
declare
  v_a text;
  v_b text;
  v_out_a text;
  v_out_b text;
  v_pre_a text;
  v_pre_b text;
begin
  v_a := upper(trim(coalesce(p_postcode_a, '')));
  v_b := upper(trim(coalesce(p_postcode_b, '')));
  if v_a = '' or v_b = '' then return 15; end if;

  -- outward code = first token (e.g. "SW1A" from "SW1A 1AA")
  v_out_a := split_part(v_a, ' ', 1);
  v_out_b := split_part(v_b, ' ', 1);
  if v_out_a = '' or v_out_b = '' then return 15; end if;

  if v_out_a = v_out_b then return 10; end if;

  v_pre_a := left(v_out_a, 2);
  v_pre_b := left(v_out_b, 2);
  if v_pre_a = v_pre_b then return 18; end if;

  return 25;
end;
$$;

revoke all on function public.estimate_travel_minutes(text, text) from public;
grant execute on function public.estimate_travel_minutes(text, text) to authenticated;

-- Ensure clients.postcode exists
alter table public.clients add column if not exists postcode text;


-- ========== 20260218200000_joint_visits_rpcs.sql ==========
-- insert_visit with joint (secondary carer) support + visit_assignments.
create or replace function public.insert_visit(
  p_agency_id uuid,
  p_client_id uuid,
  p_primary_carer_id uuid,
  p_secondary_carer_id uuid default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
  p_status text default 'scheduled',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_id uuid; v_row jsonb; v_conflict boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  if p_primary_carer_id is null then raise exception 'Primary carer is required'; end if;
  if p_secondary_carer_id = p_primary_carer_id then raise exception 'Secondary carer must be different from primary'; end if;
  if p_status is null or p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;
  if p_end_time < p_start_time then
    raise exception 'End time must be after start time';
  end if;

  -- Overlap check: primary carer
  select exists (
    select 1 from public.visits v
    inner join public.visit_assignments va on va.visit_id = v.id
    where va.carer_id = p_primary_carer_id
      and v.agency_id = p_agency_id
      and v.start_time < p_end_time
      and v.end_time > p_start_time
  ) into v_conflict;
  if v_conflict then raise exception 'Carer already has a visit during this time.'; end if;

  -- Overlap check: secondary carer if present
  if p_secondary_carer_id is not null then
    select exists (
      select 1 from public.visits v
      inner join public.visit_assignments va on va.visit_id = v.id
      where va.carer_id = p_secondary_carer_id
        and v.agency_id = p_agency_id
        and v.start_time < p_end_time
        and v.end_time > p_start_time
    ) into v_conflict;
    if v_conflict then raise exception 'Secondary carer already has a visit during this time.'; end if;
  end if;

  insert into public.visits (agency_id, client_id, carer_id, start_time, end_time, status, notes)
  values (p_agency_id, p_client_id, p_primary_carer_id, p_start_time, p_end_time, p_status, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
  values (p_agency_id, v_id, p_primary_carer_id, 'primary');
  if p_secondary_carer_id is not null then
    insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
    values (p_agency_id, v_id, p_secondary_carer_id, 'secondary');
  end if;

  select jsonb_build_object(
    'id', vi.id, 'client_id', vi.client_id, 'carer_id', vi.carer_id,
    'start_time', vi.start_time, 'end_time', vi.end_time, 'status', vi.status, 'notes', vi.notes
  ) into v_row from public.visits vi where vi.id = v_id;
  return v_row;
end;
$$;

-- Keep backward-compatible wrapper: insert_visit(agency, client, carer, start, end, status, notes)
-- The new signature has p_primary_carer_id and p_secondary_carer_id. We need to support both.
-- Actually the old API passed: p_agency_id, p_client_id, p_carer_id, p_start_time, p_end_time, p_status, p_notes
-- So the param names changed. The API route passes p_carer_id - that maps to p_primary_carer_id. We need p_secondary_carer_id as optional.
-- Let me check - the function now has p_primary_carer_id and p_secondary_carer_id. The API passes carer_id. So we need the API to pass primary and optional secondary. The old insert had p_carer_id. I'll add an overload or make the function accept both. Simpler: rename to p_primary_carer_id in the function but the API can pass it as p_primary_carer_id. Let me update the API to pass p_primary_carer_id and p_secondary_carer_id.

drop function if exists public.insert_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text);
create or replace function public.insert_visit(
  p_agency_id uuid,
  p_client_id uuid,
  p_primary_carer_id uuid,
  p_secondary_carer_id uuid default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
  p_status text default 'scheduled',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_id uuid; v_row jsonb; v_conflict boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  if p_primary_carer_id is null then raise exception 'Primary carer is required'; end if;
  if p_secondary_carer_id is not null and p_secondary_carer_id = p_primary_carer_id then
    raise exception 'Secondary carer must be different from primary';
  end if;
  if p_status is null or p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;
  if p_end_time < p_start_time then
    raise exception 'End time must be after start time';
  end if;

  select exists (
    select 1 from public.visits v
    inner join public.visit_assignments va on va.visit_id = v.id
    where va.carer_id = p_primary_carer_id and v.agency_id = p_agency_id
      and v.start_time < p_end_time and v.end_time > p_start_time
  ) into v_conflict;
  if v_conflict then raise exception 'Carer already has a visit during this time.'; end if;

  if p_secondary_carer_id is not null then
    select exists (
      select 1 from public.visits v
      inner join public.visit_assignments va on va.visit_id = v.id
      where va.carer_id = p_secondary_carer_id and v.agency_id = p_agency_id
        and v.start_time < p_end_time and v.end_time > p_start_time
    ) into v_conflict;
    if v_conflict then raise exception 'Secondary carer already has a visit during this time.'; end if;
  end if;

  insert into public.visits (agency_id, client_id, carer_id, start_time, end_time, status, notes)
  values (p_agency_id, p_client_id, p_primary_carer_id, p_start_time, p_end_time, p_status, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
  values (p_agency_id, v_id, p_primary_carer_id, 'primary');
  if p_secondary_carer_id is not null then
    insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
    values (p_agency_id, v_id, p_secondary_carer_id, 'secondary');
  end if;

  select jsonb_build_object(
    'id', vi.id, 'client_id', vi.client_id, 'carer_id', vi.carer_id,
    'start_time', vi.start_time, 'end_time', vi.end_time, 'status', vi.status, 'notes', vi.notes
  ) into v_row from public.visits vi where vi.id = v_id;
  return v_row;
end;
$$;

revoke all on function public.insert_visit(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text) from public;
grant execute on function public.insert_visit(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;

-- update_visit moved to 20260218220000_fix_update_visit_param_defaults.sql (fixes 42P13 param order)

-- list_visits: include assignments (carer_ids, is_joint)
create or replace function public.list_visits(p_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'client_id', v.client_id,
      'carer_id', v.carer_id,
      'carer_ids', (select coalesce(jsonb_agg(va.carer_id order by case va.role when 'primary' then 0 else 1 end), '[]') from public.visit_assignments va where va.visit_id = v.id),
      'assignments', (select coalesce(jsonb_agg(
        jsonb_build_object(
          'carer_id', va.carer_id,
          'carer_name', coalesce(cr2.full_name, cr2.name),
          'role', va.role
        ) order by case va.role when 'primary' then 0 else 1 end
      ), '[]') from public.visit_assignments va left join public.carers cr2 on cr2.id = va.carer_id where va.visit_id = v.id),
      'is_joint', (select count(*) >= 2 from public.visit_assignments va where va.visit_id = v.id),
      'client_name', coalesce(c.full_name, c.name),
      'carer_name', coalesce(cr.full_name, cr.name),
      'start_time', v.start_time,
      'end_time', v.end_time,
      'status', v.status,
      'notes', v.notes
    ) order by v.start_time desc
  ), '[]'::jsonb)
  into v_rows
  from public.visits v
  left join public.clients c on c.id = v.client_id and c.deleted_at is null
  left join public.carers cr on cr.id = v.carer_id
  where v.agency_id = p_agency_id;
  return v_rows;
end;
$$;

-- list_visits_for_week: include assignments, client postcode, carer names per assignment
create or replace function public.list_visits_for_week(
  p_agency_id uuid,
  p_week_start timestamptz,
  p_week_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'client_id', v.client_id,
      'client_name', coalesce(c.full_name, c.name),
      'client_postcode', c.postcode,
      'carer_id', v.carer_id,
      'carer_ids', (select coalesce(jsonb_agg(va.carer_id order by case va.role when 'primary' then 0 else 1 end), '[]') from public.visit_assignments va where va.visit_id = v.id),
      'assignments', (select coalesce(jsonb_agg(
        jsonb_build_object(
          'carer_id', va.carer_id,
          'carer_name', coalesce(cr2.full_name, cr2.name),
          'role', va.role
        ) order by case va.role when 'primary' then 0 else 1 end
      ), '[]') from public.visit_assignments va left join public.carers cr2 on cr2.id = va.carer_id where va.visit_id = v.id),
      'is_joint', (select count(*) >= 2 from public.visit_assignments va where va.visit_id = v.id),
      'start_time', v.start_time,
      'end_time', v.end_time,
      'status', v.status,
      'notes', v.notes
    ) order by v.start_time
  ), '[]'::jsonb)
  into v_rows
  from public.visits v
  left join public.clients c on c.id = v.client_id and c.deleted_at is null
  left join public.carers cr on cr.id = v.carer_id
  where v.agency_id = p_agency_id
    and v.start_time >= p_week_start
    and v.start_time < p_week_end;
  return v_rows;
end;
$$;


-- ========== 20260218200000_travel_estimate.sql ==========
-- PART D: estimateTravelMinutes (outward code heuristic, no external API)

create or replace function public.estimate_travel_minutes(p_postcode_a text, p_postcode_b text)
returns int
language plpgsql
immutable
as $$
declare
  v_a text;
  v_b text;
  v_out_a text;
  v_out_b text;
  v_pre_a text;
  v_pre_b text;
begin
  v_a := upper(trim(coalesce(p_postcode_a, '')));
  v_b := upper(trim(coalesce(p_postcode_b, '')));
  if v_a = '' or v_b = '' then return 15; end if;
  v_out_a := split_part(v_a, ' ', 1);
  v_out_b := split_part(v_b, ' ', 1);
  if v_out_a = '' or v_out_b = '' then return 15; end if;
  if v_out_a = v_out_b then return 10; end if;
  v_pre_a := left(v_out_a, 2);
  v_pre_b := left(v_out_b, 2);
  if v_pre_a = v_pre_b then return 18; end if;
  return 25;
end;
$$;

revoke all on function public.estimate_travel_minutes(text, text) from public;
grant execute on function public.estimate_travel_minutes(text, text) to authenticated;


-- ========== 20260218210000_fix_update_visit_params.sql ==========
-- Fix: input parameters after one with a default value must also have defaults
drop function if exists public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid);
drop function if exists public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text);

create or replace function public.update_visit(
  p_visit_id uuid,
  p_client_id uuid,
  p_primary_carer_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_status text default null,
  p_notes text default null,
  p_secondary_carer_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_agency_id uuid; v_conflict boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select v.agency_id into v_agency_id from public.visits v where v.id = p_visit_id;
  if v_agency_id is null then raise exception 'Visit not found'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  if p_primary_carer_id is null then raise exception 'Primary carer is required'; end if;
  if p_secondary_carer_id is not null and p_secondary_carer_id = p_primary_carer_id then
    raise exception 'Secondary carer must be different from primary';
  end if;
  if p_end_time < p_start_time then raise exception 'End time must be after start time'; end if;
  if p_status is not null and p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;
  select exists (
    select 1 from public.visits v
    inner join public.visit_assignments va on va.visit_id = v.id
    where va.carer_id = p_primary_carer_id and v.agency_id = v_agency_id and v.id != p_visit_id
      and v.start_time < p_end_time and v.end_time > p_start_time
  ) into v_conflict;
  if v_conflict then raise exception 'Carer already has a visit during this time.'; end if;
  if p_secondary_carer_id is not null then
    select exists (
      select 1 from public.visits v
      inner join public.visit_assignments va on va.visit_id = v.id
      where va.carer_id = p_secondary_carer_id and v.agency_id = v_agency_id and v.id != p_visit_id
        and v.start_time < p_end_time and v.end_time > p_start_time
    ) into v_conflict;
    if v_conflict then raise exception 'Secondary carer already has a visit during this time.'; end if;
  end if;
  update public.visits
  set client_id = p_client_id, carer_id = p_primary_carer_id, start_time = p_start_time, end_time = p_end_time,
      status = coalesce(p_status, status), notes = case when p_notes is not null then p_notes else notes end
  where id = p_visit_id;
  delete from public.visit_assignments where visit_id = p_visit_id;
  insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
  values (v_agency_id, p_visit_id, p_primary_carer_id, 'primary');
  if p_secondary_carer_id is not null then
    insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
    values (v_agency_id, p_visit_id, p_secondary_carer_id, 'secondary');
  end if;
end;
$$;
grant execute on function public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid) to authenticated;


-- ========== 20260218220000_fix_update_visit_param_defaults.sql ==========
-- Fix 42P13: parameters after one with default must also have defaults.
-- Recreate update_visit with required params first, optional params (with defaults) last.

drop function if exists public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid);
drop function if exists public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text);

create or replace function public.update_visit(
  p_visit_id uuid,
  p_client_id uuid,
  p_primary_carer_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_status text default null,
  p_notes text default null,
  p_secondary_carer_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_agency_id uuid; v_conflict boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select v.agency_id into v_agency_id from public.visits v where v.id = p_visit_id;
  if v_agency_id is null then raise exception 'Visit not found'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  if p_primary_carer_id is null then raise exception 'Primary carer is required'; end if;
  if p_secondary_carer_id is not null and p_secondary_carer_id = p_primary_carer_id then
    raise exception 'Secondary carer must be different from primary';
  end if;
  if p_end_time < p_start_time then raise exception 'End time must be after start time'; end if;
  if p_status is not null and p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;

  select exists (
    select 1 from public.visits v
    inner join public.visit_assignments va on va.visit_id = v.id
    where va.carer_id = p_primary_carer_id and v.agency_id = v_agency_id and v.id != p_visit_id
      and v.start_time < p_end_time and v.end_time > p_start_time
  ) into v_conflict;
  if v_conflict then raise exception 'Carer already has a visit during this time.'; end if;

  if p_secondary_carer_id is not null then
    select exists (
      select 1 from public.visits v
      inner join public.visit_assignments va on va.visit_id = v.id
      where va.carer_id = p_secondary_carer_id and v.agency_id = v_agency_id and v.id != p_visit_id
        and v.start_time < p_end_time and v.end_time > p_start_time
    ) into v_conflict;
    if v_conflict then raise exception 'Secondary carer already has a visit during this time.'; end if;
  end if;

  update public.visits
  set client_id = p_client_id, carer_id = p_primary_carer_id, start_time = p_start_time, end_time = p_end_time,
      status = coalesce(p_status, status), notes = case when p_notes is not null then p_notes else notes end
  where id = p_visit_id;

  delete from public.visit_assignments where visit_id = p_visit_id;
  insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
  values (v_agency_id, p_visit_id, p_primary_carer_id, 'primary');
  if p_secondary_carer_id is not null then
    insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
    values (v_agency_id, p_visit_id, p_secondary_carer_id, 'secondary');
  end if;
end;
$$;

revoke all on function public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid) from public;
grant execute on function public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid) to authenticated;


-- ========== 20260218230000_requires_double_up.sql ==========
-- Add requires_double_up flag to clients.
alter table public.clients add column if not exists requires_double_up boolean not null default false;

-- Update insert_client to accept requires_double_up.
drop function if exists public.insert_client(uuid, text, text, text, text);
create or replace function public.insert_client(
  p_agency_id uuid,
  p_name text,
  p_address text default null,
  p_postcode text default null,
  p_notes text default null,
  p_requires_double_up boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_client_id uuid; v_row jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'Name is required'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;

  insert into public.clients (agency_id, full_name, name, address, postcode, notes, requires_double_up)
  values (
    p_agency_id, trim(p_name), trim(p_name),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_postcode, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_requires_double_up, false)
  )
  returning id into v_client_id;

  select jsonb_build_object(
    'id', c.id, 'name', coalesce(c.full_name, c.name),
    'address', c.address, 'postcode', c.postcode,
    'notes', c.notes, 'requires_double_up', c.requires_double_up
  ) into v_row from public.clients c where c.id = v_client_id;
  return v_row;
end;
$$;

revoke all on function public.insert_client(uuid, text, text, text, text, boolean) from public;
grant execute on function public.insert_client(uuid, text, text, text, text, boolean) to authenticated;

-- Update list_clients to include requires_double_up.
create or replace function public.list_clients(p_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', coalesce(c.full_name, c.name),
      'address', c.address,
      'postcode', c.postcode,
      'notes', c.notes,
      'requires_double_up', c.requires_double_up
    ) order by coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  into v_rows
  from public.clients c
  where c.agency_id = p_agency_id and c.deleted_at is null;
  return v_rows;
end;
$$;

-- Update list_visits: add requires_double_up, assigned_count, missing_second_carer
create or replace function public.list_visits(p_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'client_id', v.client_id,
      'carer_id', v.carer_id,
      'carer_ids', (select coalesce(jsonb_agg(va.carer_id order by case va.role when 'primary' then 0 else 1 end), '[]') from public.visit_assignments va where va.visit_id = v.id),
      'assignments', (select coalesce(jsonb_agg(
        jsonb_build_object('carer_id', va.carer_id, 'carer_name', coalesce(cr2.full_name, cr2.name), 'role', va.role)
        order by case va.role when 'primary' then 0 else 1 end
      ), '[]') from public.visit_assignments va left join public.carers cr2 on cr2.id = va.carer_id where va.visit_id = v.id),
      'assigned_count', (select count(*) from public.visit_assignments va where va.visit_id = v.id),
      'is_joint', (select count(*) >= 2 from public.visit_assignments va where va.visit_id = v.id),
      'requires_double_up', coalesce(c.requires_double_up, false),
      'missing_second_carer', (coalesce(c.requires_double_up, false) and (select count(*) from public.visit_assignments va where va.visit_id = v.id) < 2),
      'client_name', coalesce(c.full_name, c.name),
      'carer_name', coalesce(cr.full_name, cr.name),
      'start_time', v.start_time,
      'end_time', v.end_time,
      'status', v.status,
      'notes', v.notes
    ) order by v.start_time desc
  ), '[]'::jsonb)
  into v_rows
  from public.visits v
  left join public.clients c on c.id = v.client_id and c.deleted_at is null
  left join public.carers cr on cr.id = v.carer_id
  where v.agency_id = p_agency_id;
  return v_rows;
end;
$$;

-- Update list_visits_for_week: add requires_double_up, assigned_count, missing_second_carer
create or replace function public.list_visits_for_week(
  p_agency_id uuid,
  p_week_start timestamptz,
  p_week_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'client_id', v.client_id,
      'client_name', coalesce(c.full_name, c.name),
      'client_postcode', c.postcode,
      'carer_id', v.carer_id,
      'carer_ids', (select coalesce(jsonb_agg(va.carer_id order by case va.role when 'primary' then 0 else 1 end), '[]') from public.visit_assignments va where va.visit_id = v.id),
      'assignments', (select coalesce(jsonb_agg(
        jsonb_build_object('carer_id', va.carer_id, 'carer_name', coalesce(cr2.full_name, cr2.name), 'role', va.role)
        order by case va.role when 'primary' then 0 else 1 end
      ), '[]') from public.visit_assignments va left join public.carers cr2 on cr2.id = va.carer_id where va.visit_id = v.id),
      'assigned_count', (select count(*) from public.visit_assignments va where va.visit_id = v.id),
      'is_joint', (select count(*) >= 2 from public.visit_assignments va where va.visit_id = v.id),
      'requires_double_up', coalesce(c.requires_double_up, false),
      'missing_second_carer', (coalesce(c.requires_double_up, false) and (select count(*) from public.visit_assignments va where va.visit_id = v.id) < 2),
      'start_time', v.start_time,
      'end_time', v.end_time,
      'status', v.status,
      'notes', v.notes
    ) order by v.start_time
  ), '[]'::jsonb)
  into v_rows
  from public.visits v
  left join public.clients c on c.id = v.client_id and c.deleted_at is null
  left join public.carers cr on cr.id = v.carer_id
  where v.agency_id = p_agency_id
    and v.start_time >= p_week_start
    and v.start_time < p_week_end;
  return v_rows;
end;
$$;


-- ========== 20260218240000_invites_and_roles.sql ==========
-- Expand role options on agency_members: owner > admin > manager > viewer
alter table public.agency_members drop constraint if exists agency_members_role_check;
alter table public.agency_members
  add constraint agency_members_role_check
  check (role in ('owner', 'admin', 'manager', 'viewer'));

-- Migrate legacy 'member' role to 'viewer'
update public.agency_members set role = 'viewer' where role = 'member';

-- Agency invites table
create table if not exists public.agency_invites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'viewer')),
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_agency_invites_agency on public.agency_invites(agency_id);
create index if not exists idx_agency_invites_token on public.agency_invites(token);

alter table public.agency_invites enable row level security;

-- Only agency admins+ can see invites for their agency
drop policy if exists "invites_select_admin" on public.agency_invites;
create policy "invites_select_admin" on public.agency_invites
for select to authenticated
using (
  exists (
    select 1 from public.agency_members am
    where am.agency_id = agency_invites.agency_id
      and am.user_id = auth.uid()
      and am.role in ('owner', 'admin')
  )
);

-- Only agency admins+ can insert invites
drop policy if exists "invites_insert_admin" on public.agency_invites;
create policy "invites_insert_admin" on public.agency_invites
for insert to authenticated
with check (
  exists (
    select 1 from public.agency_members am
    where am.agency_id = agency_invites.agency_id
      and am.user_id = auth.uid()
      and am.role in ('owner', 'admin')
  )
);

-- Only agency admins+ can delete invites
drop policy if exists "invites_delete_admin" on public.agency_invites;
create policy "invites_delete_admin" on public.agency_invites
for delete to authenticated
using (
  exists (
    select 1 from public.agency_members am
    where am.agency_id = agency_invites.agency_id
      and am.user_id = auth.uid()
      and am.role in ('owner', 'admin')
  )
);

-- Restrict agency_members DELETE to admins+
drop policy if exists "agency_members_delete_admin" on public.agency_members;
create policy "agency_members_delete_admin" on public.agency_members
for delete to authenticated
using (
  exists (
    select 1 from public.agency_members am2
    where am2.agency_id = agency_members.agency_id
      and am2.user_id = auth.uid()
      and am2.role in ('owner', 'admin')
  )
  and agency_members.role != 'owner'
);

-- Allow admin+ to update member roles (but not the owner)
drop policy if exists "agency_members_update_admin" on public.agency_members;
create policy "agency_members_update_admin" on public.agency_members
for update to authenticated
using (
  exists (
    select 1 from public.agency_members am2
    where am2.agency_id = agency_members.agency_id
      and am2.user_id = auth.uid()
      and am2.role in ('owner', 'admin')
  )
  and agency_members.role != 'owner'
)
with check (
  role in ('admin', 'manager', 'viewer')
);

-- RPC: list agency members (agency-scoped)
create or replace function public.list_agency_members(p_agency_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', am.id,
      'user_id', am.user_id,
      'email', u.email,
      'role', am.role,
      'created_at', am.created_at
    ) order by
      case am.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3 end,
      am.created_at
  ), '[]'::jsonb)
  into v_rows
  from public.agency_members am
  join auth.users u on u.id = am.user_id
  where am.agency_id = p_agency_id;
  return v_rows;
end;
$$;

-- RPC: create invite (admin+ only)
create or replace function public.create_invite(
  p_agency_id uuid,
  p_email text,
  p_role text default 'viewer'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_row jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select role into v_role from public.agency_members
    where user_id = v_user_id and agency_id = p_agency_id;
  if v_role is null then raise exception 'Not authorized for this agency'; end if;
  if v_role not in ('owner', 'admin') then raise exception 'Only admins can invite members'; end if;
  if p_role not in ('admin', 'manager', 'viewer') then raise exception 'Invalid role'; end if;
  if trim(coalesce(p_email, '')) = '' then raise exception 'Email is required'; end if;

  -- Check if already a member
  if exists (
    select 1 from public.agency_members am
    join auth.users u on u.id = am.user_id
    where am.agency_id = p_agency_id and lower(u.email) = lower(trim(p_email))
  ) then
    raise exception 'User is already a member of this agency';
  end if;

  insert into public.agency_invites (agency_id, email, role, created_by)
  values (p_agency_id, lower(trim(p_email)), p_role, v_user_id)
  returning jsonb_build_object(
    'id', id, 'token', token, 'email', email,
    'role', role, 'expires_at', expires_at
  ) into v_row;
  return v_row;
end;
$$;

-- RPC: accept invite (anyone authenticated with the token)
create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_invite record; v_email text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select * into v_invite from public.agency_invites
    where token = p_token and accepted_at is null;
  if v_invite is null then raise exception 'Invite not found or already used'; end if;
  if v_invite.expires_at < now() then raise exception 'Invite has expired'; end if;

  -- Verify email matches
  select email into v_email from auth.users where id = v_user_id;
  if lower(v_email) != lower(v_invite.email) then
    raise exception 'This invite was sent to a different email address';
  end if;

  -- Check not already a member
  if exists (select 1 from public.agency_members where agency_id = v_invite.agency_id and user_id = v_user_id) then
    update public.agency_invites set accepted_at = now() where id = v_invite.id;
    return jsonb_build_object('status', 'already_member', 'agency_id', v_invite.agency_id);
  end if;

  insert into public.agency_members (agency_id, user_id, role)
  values (v_invite.agency_id, v_user_id, v_invite.role);

  update public.agency_invites set accepted_at = now() where id = v_invite.id;

  return jsonb_build_object('status', 'accepted', 'agency_id', v_invite.agency_id, 'role', v_invite.role);
end;
$$;

-- RPC: list invites for agency (admin+ only)
create or replace function public.list_invites(p_agency_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select role into v_role from public.agency_members
    where user_id = v_user_id and agency_id = p_agency_id;
  if v_role is null then raise exception 'Not authorized'; end if;
  if v_role not in ('owner', 'admin') then raise exception 'Only admins can view invites'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id, 'email', i.email, 'role', i.role,
      'token', i.token, 'expires_at', i.expires_at,
      'accepted_at', i.accepted_at, 'created_at', i.created_at
    ) order by i.created_at desc
  ), '[]'::jsonb)
  into v_rows
  from public.agency_invites i
  where i.agency_id = p_agency_id;
  return v_rows;
end;
$$;

-- RPC: get current user's role in agency
create or replace function public.get_my_role(p_agency_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_role text;
begin
  select role into v_role from public.agency_members
    where user_id = auth.uid() and agency_id = p_agency_id;
  return v_role;
end;
$$;


-- ========== 20260218250000_travel_geolocation.sql ==========
-- Add geolocation columns to clients
alter table public.clients add column if not exists latitude double precision;
alter table public.clients add column if not exists longitude double precision;

-- Travel cache: stores computed travel time between client pairs
create table if not exists public.travel_cache (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  from_client_id uuid not null references public.clients(id) on delete cascade,
  to_client_id uuid not null references public.clients(id) on delete cascade,
  distance_km double precision not null,
  travel_minutes integer not null,
  created_at timestamptz not null default now(),
  unique(agency_id, from_client_id, to_client_id)
);

create index if not exists idx_travel_cache_lookup
  on public.travel_cache(agency_id, from_client_id, to_client_id);

alter table public.travel_cache enable row level security;

drop policy if exists "travel_cache_select_member" on public.travel_cache;
create policy "travel_cache_select_member" on public.travel_cache
for select to authenticated
using (exists (
  select 1 from public.agency_members am
  where am.agency_id = travel_cache.agency_id and am.user_id = auth.uid()
));

drop policy if exists "travel_cache_insert_member" on public.travel_cache;
create policy "travel_cache_insert_member" on public.travel_cache
for insert to authenticated
with check (exists (
  select 1 from public.agency_members am
  where am.agency_id = travel_cache.agency_id and am.user_id = auth.uid()
));

-- Update insert_client to accept lat/lng
drop function if exists public.insert_client(uuid, text, text, text, text, boolean);
create or replace function public.insert_client(
  p_agency_id uuid,
  p_name text,
  p_address text default null,
  p_postcode text default null,
  p_notes text default null,
  p_requires_double_up boolean default false,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_client_id uuid; v_row jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'Name is required'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;

  insert into public.clients (agency_id, full_name, name, address, postcode, notes, requires_double_up, latitude, longitude)
  values (
    p_agency_id, trim(p_name), trim(p_name),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_postcode, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_requires_double_up, false),
    p_latitude, p_longitude
  )
  returning id into v_client_id;

  select jsonb_build_object(
    'id', c.id, 'name', coalesce(c.full_name, c.name),
    'address', c.address, 'postcode', c.postcode,
    'notes', c.notes, 'requires_double_up', c.requires_double_up,
    'latitude', c.latitude, 'longitude', c.longitude
  ) into v_row from public.clients c where c.id = v_client_id;
  return v_row;
end;
$$;

revoke all on function public.insert_client(uuid, text, text, text, text, boolean, double precision, double precision) from public;
grant execute on function public.insert_client(uuid, text, text, text, text, boolean, double precision, double precision) to authenticated;

-- Update list_visits_for_week to include client lat/lng
create or replace function public.list_visits_for_week(
  p_agency_id uuid,
  p_week_start timestamptz,
  p_week_end timestamptz
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'client_id', v.client_id,
      'client_name', coalesce(c.full_name, c.name),
      'client_postcode', c.postcode,
      'client_lat', c.latitude,
      'client_lng', c.longitude,
      'carer_id', v.carer_id,
      'carer_ids', (select coalesce(jsonb_agg(va.carer_id order by case va.role when 'primary' then 0 else 1 end), '[]') from public.visit_assignments va where va.visit_id = v.id),
      'assignments', (select coalesce(jsonb_agg(
        jsonb_build_object('carer_id', va.carer_id, 'carer_name', coalesce(cr2.full_name, cr2.name), 'role', va.role)
        order by case va.role when 'primary' then 0 else 1 end
      ), '[]') from public.visit_assignments va left join public.carers cr2 on cr2.id = va.carer_id where va.visit_id = v.id),
      'assigned_count', (select count(*) from public.visit_assignments va where va.visit_id = v.id),
      'is_joint', (select count(*) >= 2 from public.visit_assignments va where va.visit_id = v.id),
      'requires_double_up', coalesce(c.requires_double_up, false),
      'missing_second_carer', (coalesce(c.requires_double_up, false) and (select count(*) from public.visit_assignments va where va.visit_id = v.id) < 2),
      'start_time', v.start_time,
      'end_time', v.end_time,
      'status', v.status,
      'notes', v.notes
    ) order by v.start_time
  ), '[]'::jsonb)
  into v_rows
  from public.visits v
  left join public.clients c on c.id = v.client_id and c.deleted_at is null
  left join public.carers cr on cr.id = v.carer_id
  where v.agency_id = p_agency_id
    and v.start_time >= p_week_start
    and v.start_time < p_week_end;
  return v_rows;
end;
$$;

-- Update list_clients to include lat/lng
create or replace function public.list_clients(p_agency_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', coalesce(c.full_name, c.name),
      'address', c.address,
      'postcode', c.postcode,
      'notes', c.notes,
      'requires_double_up', c.requires_double_up,
      'latitude', c.latitude,
      'longitude', c.longitude
    ) order by coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  into v_rows
  from public.clients c
  where c.agency_id = p_agency_id and c.deleted_at is null;
  return v_rows;
end;
$$;

-- Allow authenticated users to update client lat/lng (for geocoding)
drop policy if exists "clients_update_member" on public.clients;
create policy "clients_update_member" on public.clients
for update to authenticated
using (exists (
  select 1 from public.agency_members am
  where am.agency_id = clients.agency_id and am.user_id = auth.uid()
))
with check (exists (
  select 1 from public.agency_members am
  where am.agency_id = clients.agency_id and am.user_id = auth.uid()
));

-- Allow delete on travel_cache for cache invalidation
drop policy if exists "travel_cache_delete_member" on public.travel_cache;
create policy "travel_cache_delete_member" on public.travel_cache
for delete to authenticated
using (exists (
  select 1 from public.agency_members am
  where am.agency_id = travel_cache.agency_id and am.user_id = auth.uid()
));

-- RPC: upsert travel cache (called from API)
create or replace function public.upsert_travel_cache(
  p_agency_id uuid,
  p_from_client_id uuid,
  p_to_client_id uuid,
  p_distance_km double precision,
  p_travel_minutes integer
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.travel_cache (agency_id, from_client_id, to_client_id, distance_km, travel_minutes)
  values (p_agency_id, p_from_client_id, p_to_client_id, p_distance_km, p_travel_minutes)
  on conflict (agency_id, from_client_id, to_client_id)
  do update set distance_km = excluded.distance_km,
    travel_minutes = excluded.travel_minutes,
    created_at = now();
end;
$$;


-- ========== 20260219120000_geocode_rpc.sql ==========
-- RPC to update client lat/lng for geocoding, bypasses RLS to avoid stack depth recursion.
create or replace function public.update_client_geocode(
  p_client_id uuid,
  p_agency_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clients
  set latitude = p_latitude, longitude = p_longitude
  where id = p_client_id
    and agency_id = p_agency_id
    and deleted_at is null;
  return found;
end;
$$;

revoke all on function public.update_client_geocode(uuid, uuid, double precision, double precision) from public;
grant execute on function public.update_client_geocode(uuid, uuid, double precision, double precision) to authenticated;

-- Also provide a security-definer lookup so the geocode route can verify client ownership without RLS recursion.
create or replace function public.get_client_postcode(
  p_client_id uuid,
  p_agency_id uuid
)
returns table(id uuid, postcode text)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, c.postcode
  from public.clients c
  where c.id = p_client_id
    and c.agency_id = p_agency_id
    and c.deleted_at is null;
$$;

revoke all on function public.get_client_postcode(uuid, uuid) from public;
grant execute on function public.get_client_postcode(uuid, uuid) to authenticated;

-- Ensure travel_cache has travel_minutes (in case table uses estimated_minutes from older schema)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'travel_cache') then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'travel_cache' and column_name = 'estimated_minutes')
       and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'travel_cache' and column_name = 'travel_minutes') then
      alter table public.travel_cache rename column estimated_minutes to travel_minutes;
    elsif not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'travel_cache' and column_name = 'travel_minutes') then
      alter table public.travel_cache add column travel_minutes integer;
      update public.travel_cache set travel_minutes = 15 where travel_minutes is null;
      alter table public.travel_cache alter column travel_minutes set not null;
    end if;
  end if;
end
$$;

-- Lookup travel_cache entries for given agency + client pairs (bypasses RLS).
create or replace function public.lookup_travel_cache(
  p_agency_id uuid,
  p_from_ids uuid[],
  p_to_ids uuid[]
)
returns table(from_client_id uuid, to_client_id uuid, travel_minutes integer)
language sql
security definer
stable
set search_path = public
as $$
  select tc.from_client_id, tc.to_client_id, tc.travel_minutes
  from public.travel_cache tc
  where tc.agency_id = p_agency_id
    and tc.from_client_id = any(p_from_ids)
    and tc.to_client_id = any(p_to_ids);
$$;

revoke all on function public.lookup_travel_cache(uuid, uuid[], uuid[]) from public;
grant execute on function public.lookup_travel_cache(uuid, uuid[], uuid[]) to authenticated;


-- ========== 20260220000000_swap_visit_times.sql ==========
-- swap_visit_times: swap start/end between two visits (for route reordering).
-- Both visits must be same agency; user must be agency member.
create or replace function public.swap_visit_times(
  p_visit_a_id uuid,
  p_visit_b_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_agency_id uuid;
  v_a record;
  v_b record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select id, agency_id, start_time, end_time into v_a
  from public.visits where id = p_visit_a_id;
  if v_a.id is null then
    raise exception 'Visit A not found';
  end if;

  select id, agency_id, start_time, end_time into v_b
  from public.visits where id = p_visit_b_id;
  if v_b.id is null then
    raise exception 'Visit B not found';
  end if;

  if v_a.agency_id != v_b.agency_id then
    raise exception 'Visits must belong to same agency';
  end if;
  v_agency_id := v_a.agency_id;

  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;

  -- Swap times in a single transaction
  update public.visits set start_time = v_b.start_time, end_time = v_b.end_time where id = p_visit_a_id;
  update public.visits set start_time = v_a.start_time, end_time = v_a.end_time where id = p_visit_b_id;
end;
$$;

revoke all on function public.swap_visit_times(uuid, uuid) from public;
grant execute on function public.swap_visit_times(uuid, uuid) to authenticated;


-- ========== 20260220100000_carer_role_rls.sql ==========
-- RLS policies for carer role: carers can only see their assigned visits and clients.
-- No care_plan table exists; skipped per schema.

-- 1) Add 'carer' to agency_members and agency_invites role
alter table public.agency_members drop constraint if exists agency_members_role_check;
alter table public.agency_members
  add constraint agency_members_role_check
  check (role in ('owner', 'admin', 'manager', 'viewer', 'carer'));

-- Allow inviting carers (constraint may have auto-generated name)
alter table public.agency_invites drop constraint if exists agency_invites_role_check;
alter table public.agency_invites add constraint agency_invites_role_check
  check (role in ('admin', 'manager', 'viewer', 'carer'));

-- Update create_invite to accept 'carer' role
create or replace function public.create_invite(
  p_agency_id uuid,
  p_email text,
  p_role text default 'viewer'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_row jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  if v_role is null then raise exception 'Not authorized for this agency'; end if;
  if v_role not in ('owner', 'admin') then raise exception 'Only admins can invite members'; end if;
  if p_role not in ('admin', 'manager', 'viewer', 'carer') then raise exception 'Invalid role'; end if;
  if trim(coalesce(p_email, '')) = '' then raise exception 'Email is required'; end if;
  if exists (select 1 from public.agency_members am join auth.users u on u.id = am.user_id where am.agency_id = p_agency_id and lower(u.email) = lower(trim(p_email))) then
    raise exception 'User is already a member of this agency';
  end if;
  insert into public.agency_invites (agency_id, email, role, created_by)
  values (p_agency_id, lower(trim(p_email)), p_role, v_user_id)
  returning jsonb_build_object('id', id, 'token', token, 'email', email, 'role', role, 'expires_at', expires_at) into v_row;
  return v_row;
end;
$$;

-- Update accept_invite: when role='carer', link or create carer record
create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_invite record; v_email text; v_updated int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select * into v_invite from public.agency_invites where token = p_token and accepted_at is null;
  if v_invite is null then raise exception 'Invite not found or already used'; end if;
  if v_invite.expires_at < now() then raise exception 'Invite has expired'; end if;
  select email into v_email from auth.users where id = v_user_id;
  if lower(v_email) != lower(v_invite.email) then raise exception 'This invite was sent to a different email address'; end if;
  if exists (select 1 from public.agency_members where agency_id = v_invite.agency_id and user_id = v_user_id) then
    update public.agency_invites set accepted_at = now() where id = v_invite.id;
    return jsonb_build_object('status', 'already_member', 'agency_id', v_invite.agency_id);
  end if;

  insert into public.agency_members (agency_id, user_id, role)
  values (v_invite.agency_id, v_user_id, v_invite.role);

  -- If carer role: link existing carer by email or create new
  if v_invite.role = 'carer' then
    update public.carers set user_id = v_user_id where id in (
      select c.id from public.carers c
      where c.agency_id = v_invite.agency_id
        and (c.email is null or lower(trim(c.email)) = lower(trim(v_invite.email)))
        and c.user_id is null
      limit 1
    );
    if not found then
      insert into public.carers (agency_id, full_name, name, email, user_id)
      values (v_invite.agency_id, coalesce(split_part(v_email, '@', 1), 'Carer'), coalesce(split_part(v_email, '@', 1), 'Carer'), v_email, v_user_id);
    end if;
  end if;

  update public.agency_invites set accepted_at = now() where id = v_invite.id;
  return jsonb_build_object('status', 'accepted', 'agency_id', v_invite.agency_id, 'role', v_invite.role);
end;
$$;

-- 2) Link carers to auth users (for carer-role members)
alter table public.carers add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists idx_carers_agency_user on public.carers(agency_id, user_id) where user_id is not null;

-- 3) Helper: carer IDs for current user in an agency (used in RLS)
create or replace function public.get_my_carer_ids(p_agency_id uuid)
returns uuid[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(array_agg(c.id), array[]::uuid[])
  from public.carers c
  where c.agency_id = p_agency_id
    and c.user_id = auth.uid();
$$;

revoke all on function public.get_my_carer_ids(uuid) from public;
grant execute on function public.get_my_carer_ids(uuid) to authenticated;

-- 4) Visits: SELECT - manager+ sees all; carer sees only visits assigned to them
drop policy if exists "visits_select" on public.visits;
create policy "visits_select" on public.visits
for select to authenticated
using (
  exists (
    select 1 from public.agency_members am
    where am.user_id = auth.uid() and am.agency_id = visits.agency_id
    and (
      am.role in ('owner', 'admin', 'manager', 'viewer')
      or exists (
        select 1 from public.visit_assignments va
        where va.visit_id = visits.id
        and va.carer_id = any(public.get_my_carer_ids(visits.agency_id))
      )
    )
  )
);

-- Carers cannot insert/update/delete visits
drop policy if exists "visits_insert" on public.visits;
create policy "visits_insert" on public.visits
for insert to authenticated
with check (
  public.is_agency_member(agency_id)
  and exists (
    select 1 from public.agency_members am
    where am.user_id = auth.uid() and am.agency_id = agency_id
    and am.role in ('owner', 'admin', 'manager')
  )
);

drop policy if exists "visits_update" on public.visits;
create policy "visits_update" on public.visits
for update to authenticated
using (
  public.is_agency_member(agency_id)
  and exists (
    select 1 from public.agency_members am
    where am.user_id = auth.uid() and am.agency_id = agency_id
    and am.role in ('owner', 'admin', 'manager')
  )
)
with check (public.is_agency_member(agency_id));

drop policy if exists "visits_delete" on public.visits;
create policy "visits_delete" on public.visits
for delete to authenticated
using (
  public.is_agency_member(agency_id)
  and exists (
    select 1 from public.agency_members am
    where am.user_id = auth.uid() and am.agency_id = agency_id
    and am.role in ('owner', 'admin', 'manager')
  )
);

-- 5) Clients: SELECT - manager+ sees all; carer sees only clients they have visits for
drop policy if exists "clients_select" on public.clients;
create policy "clients_select" on public.clients
for select to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.agency_members am
    where am.user_id = auth.uid() and am.agency_id = clients.agency_id
    and (
      am.role in ('owner', 'admin', 'manager', 'viewer')
      or exists (
        select 1 from public.visits v
        join public.visit_assignments va on va.visit_id = v.id
        where v.client_id = clients.id
        and v.agency_id = clients.agency_id
        and va.carer_id = any(public.get_my_carer_ids(clients.agency_id))
      )
    )
  )
);

-- Carers cannot insert/update/delete clients
drop policy if exists "clients_insert" on public.clients;
create policy "clients_insert" on public.clients
for insert to authenticated
with check (
  public.is_agency_member(agency_id)
  and exists (
    select 1 from public.agency_members am
    where am.user_id = auth.uid() and am.agency_id = agency_id
    and am.role in ('owner', 'admin', 'manager')
  )
);

drop policy if exists "clients_update" on public.clients;
create policy "clients_update" on public.clients
for update to authenticated
using (
  deleted_at is null and public.is_agency_member(agency_id)
  and exists (
    select 1 from public.agency_members am
    where am.user_id = auth.uid() and am.agency_id = agency_id
    and am.role in ('owner', 'admin', 'manager')
  )
)
with check (public.is_agency_member(agency_id));

drop policy if exists "clients_delete" on public.clients;
create policy "clients_delete" on public.clients
for delete to authenticated
using (
  deleted_at is null and public.is_agency_member(agency_id)
  and exists (
    select 1 from public.agency_members am
    where am.user_id = auth.uid() and am.agency_id = agency_id
    and am.role in ('owner', 'admin', 'manager')
  )
);

-- 6) Update RPCs to filter by carer when role = 'carer'
-- list_visits_for_week: carers only see their assigned visits
create or replace function public.list_visits_for_week(
  p_agency_id uuid,
  p_week_start timestamptz,
  p_week_end timestamptz
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'client_id', v.client_id,
      'client_name', coalesce(c.full_name, c.name),
      'client_postcode', c.postcode,
      'client_lat', c.latitude,
      'client_lng', c.longitude,
      'carer_id', v.carer_id,
      'carer_ids', (select coalesce(jsonb_agg(va.carer_id order by case va.role when 'primary' then 0 else 1 end), '[]') from public.visit_assignments va where va.visit_id = v.id),
      'assignments', (select coalesce(jsonb_agg(
        jsonb_build_object('carer_id', va.carer_id, 'carer_name', coalesce(cr2.full_name, cr2.name), 'role', va.role)
        order by case va.role when 'primary' then 0 else 1 end
      ), '[]') from public.visit_assignments va left join public.carers cr2 on cr2.id = va.carer_id where va.visit_id = v.id),
      'assigned_count', (select count(*) from public.visit_assignments va where va.visit_id = v.id),
      'is_joint', (select count(*) >= 2 from public.visit_assignments va where va.visit_id = v.id),
      'requires_double_up', coalesce(c.requires_double_up, false),
      'missing_second_carer', (coalesce(c.requires_double_up, false) and (select count(*) from public.visit_assignments va where va.visit_id = v.id) < 2),
      'start_time', v.start_time,
      'end_time', v.end_time,
      'status', v.status,
      'notes', v.notes
    ) order by v.start_time
  ), '[]'::jsonb)
  into v_rows
  from public.visits v
  left join public.clients c on c.id = v.client_id and c.deleted_at is null
  left join public.carers cr on cr.id = v.carer_id
  where v.agency_id = p_agency_id
    and v.start_time >= p_week_start
    and v.start_time < p_week_end
    and (v_role != 'carer' or exists (
      select 1 from public.visit_assignments va
      where va.visit_id = v.id and va.carer_id = any(public.get_my_carer_ids(p_agency_id))
    ));
  return v_rows;
end;
$$;

-- list_visits: carers only see their assigned visits
create or replace function public.list_visits(p_agency_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'client_id', v.client_id,
      'carer_id', v.carer_id,
      'carer_ids', (select coalesce(jsonb_agg(va.carer_id order by case va.role when 'primary' then 0 else 1 end), '[]') from public.visit_assignments va where va.visit_id = v.id),
      'assignments', (select coalesce(jsonb_agg(
        jsonb_build_object('carer_id', va.carer_id, 'carer_name', coalesce(cr2.full_name, cr2.name), 'role', va.role)
        order by case va.role when 'primary' then 0 else 1 end
      ), '[]') from public.visit_assignments va left join public.carers cr2 on cr2.id = va.carer_id where va.visit_id = v.id),
      'assigned_count', (select count(*) from public.visit_assignments va where va.visit_id = v.id),
      'is_joint', (select count(*) >= 2 from public.visit_assignments va where va.visit_id = v.id),
      'requires_double_up', coalesce(c.requires_double_up, false),
      'missing_second_carer', (coalesce(c.requires_double_up, false) and (select count(*) from public.visit_assignments va where va.visit_id = v.id) < 2),
      'client_name', coalesce(c.full_name, c.name),
      'carer_name', coalesce(cr.full_name, cr.name),
      'start_time', v.start_time,
      'end_time', v.end_time,
      'status', v.status,
      'notes', v.notes
    ) order by v.start_time desc
  ), '[]'::jsonb)
  into v_rows
  from public.visits v
  left join public.clients c on c.id = v.client_id and c.deleted_at is null
  left join public.carers cr on cr.id = v.carer_id
  where v.agency_id = p_agency_id
    and (v_role != 'carer' or exists (
      select 1 from public.visit_assignments va
      where va.visit_id = v.id and va.carer_id = any(public.get_my_carer_ids(p_agency_id))
    ));
  return v_rows;
end;
$$;

-- list_clients: carers only see clients they have visits for
create or replace function public.list_clients(p_agency_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', coalesce(c.full_name, c.name),
      'address', c.address,
      'postcode', c.postcode,
      'notes', c.notes,
      'requires_double_up', c.requires_double_up,
      'latitude', c.latitude,
      'longitude', c.longitude
    ) order by coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  into v_rows
  from public.clients c
  where c.agency_id = p_agency_id and c.deleted_at is null
    and (v_role != 'carer' or exists (
      select 1 from public.visits v
      join public.visit_assignments va on va.visit_id = v.id
      where v.client_id = c.id and v.agency_id = p_agency_id
      and va.carer_id = any(public.get_my_carer_ids(p_agency_id))
    ));
  return v_rows;
end;
$$;


-- ========== 20260221000000_funding_billing.sql ==========
-- 1) Add clients.funding_type
alter table public.clients
  add column if not exists funding_type text not null default 'private'
  check (funding_type in ('private', 'local_authority'));

-- Update insert_client to accept funding_type
drop function if exists public.insert_client(uuid, text, text, text, text, boolean, double precision, double precision);
create or replace function public.insert_client(
  p_agency_id uuid,
  p_name text,
  p_address text default null,
  p_postcode text default null,
  p_notes text default null,
  p_requires_double_up boolean default false,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_funding_type text default 'private'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_client_id uuid; v_row jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'Name is required'; end if;
  if p_funding_type is not null and p_funding_type not in ('private', 'local_authority') then
    raise exception 'Invalid funding_type';
  end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;

  insert into public.clients (agency_id, full_name, name, address, postcode, notes, requires_double_up, latitude, longitude, funding_type)
  values (
    p_agency_id, trim(p_name), trim(p_name),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_postcode, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_requires_double_up, false),
    p_latitude, p_longitude,
    coalesce(nullif(trim(p_funding_type), ''), 'private')
  )
  returning id into v_client_id;

  select jsonb_build_object(
    'id', c.id, 'name', coalesce(c.full_name, c.name),
    'address', c.address, 'postcode', c.postcode,
    'notes', c.notes, 'requires_double_up', c.requires_double_up,
    'latitude', c.latitude, 'longitude', c.longitude,
    'funding_type', c.funding_type
  ) into v_row from public.clients c where c.id = v_client_id;
  return v_row;
end;
$$;

revoke all on function public.insert_client(uuid, text, text, text, text, boolean, double precision, double precision, text) from public;
grant execute on function public.insert_client(uuid, text, text, text, text, boolean, double precision, double precision, text) to authenticated;

-- Update list_clients to include funding_type
create or replace function public.list_clients(p_agency_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', coalesce(c.full_name, c.name),
      'address', c.address,
      'postcode', c.postcode,
      'notes', c.notes,
      'requires_double_up', c.requires_double_up,
      'latitude', c.latitude,
      'longitude', c.longitude,
      'funding_type', coalesce(c.funding_type, 'private')
    ) order by coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  into v_rows
  from public.clients c
  where c.agency_id = p_agency_id and c.deleted_at is null
    and (v_role != 'carer' or exists (
      select 1 from public.visits v
      join public.visit_assignments va on va.visit_id = v.id
      where v.client_id = c.id and v.agency_id = p_agency_id
      and va.carer_id = any(public.get_my_carer_ids(p_agency_id))
    ));
  return v_rows;
end;
$$;

-- 2) Add visits.billable_minutes (manual override)
alter table public.visits
  add column if not exists billable_minutes integer;

-- 3) Add visits.actual_start_time and actual_end_time if not exist
alter table public.visits add column if not exists actual_start_time timestamptz;
alter table public.visits add column if not exists actual_end_time timestamptz;

-- 4) Create view v_visit_billing
-- billable_minutes override if set, else actual duration if available, else planned duration
drop view if exists public.v_visit_billing;
create view public.v_visit_billing as
select
  v.id as visit_id,
  v.agency_id,
  v.client_id,
  v.start_time,
  v.end_time,
  v.actual_start_time,
  v.actual_end_time,
  v.billable_minutes as billable_minutes_override,
  coalesce(
    v.billable_minutes,
    case
      when v.actual_start_time is not null and v.actual_end_time is not null
        and v.actual_end_time > v.actual_start_time
      then extract(epoch from (v.actual_end_time - v.actual_start_time))::integer / 60
      else extract(epoch from (v.end_time - v.start_time))::integer / 60
    end
  )::integer as billable_minutes
from public.visits v;

-- Grant select to authenticated
grant select on public.v_visit_billing to authenticated;

-- RPC: list billing data for date range (manager+ only)
-- Returns visits with billable_minutes, grouped by client, with client funding_type
create or replace function public.list_billing_for_range(
  p_agency_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_role text; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  if v_role not in ('owner', 'admin', 'manager') then
    raise exception 'Billing access is for managers only';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'visit_id', r.visit_id,
      'client_id', r.client_id,
      'client_name', r.client_name,
      'funding_type', r.funding_type,
      'start_time', r.start_time,
      'end_time', r.end_time,
      'billable_minutes', r.billable_minutes
    ) order by r.client_name, r.start_time
  ), '[]'::jsonb) into v_rows
  from (
    select
      vb.visit_id,
      vb.client_id,
      coalesce(c.full_name, c.name) as client_name,
      coalesce(c.funding_type, 'private') as funding_type,
      vb.start_time,
      vb.end_time,
      vb.billable_minutes
    from public.v_visit_billing vb
    left join public.clients c on c.id = vb.client_id and c.deleted_at is null
    where vb.agency_id = p_agency_id
      and vb.start_time >= p_start
      and vb.start_time < p_end
  ) r;
  return v_rows;
end;
$$;

revoke all on function public.list_billing_for_range(uuid, timestamptz, timestamptz) from public;
grant execute on function public.list_billing_for_range(uuid, timestamptz, timestamptz) to authenticated;


-- ========== 20260221100000_update_client_rpc.sql ==========
-- update_client RPC: bypasses RLS to avoid "stack depth limit exceeded" on direct table update
create or replace function public.update_client(
  p_client_id uuid,
  p_name text default null,
  p_address text default null,
  p_postcode text default null,
  p_notes text default null,
  p_requires_double_up boolean default null,
  p_funding_type text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_agency_id uuid; v_role text; v_row jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select c.agency_id into v_agency_id from public.clients c where c.id = p_client_id and c.deleted_at is null;
  if v_agency_id is null then raise exception 'Client not found'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = v_agency_id limit 1;
  if v_role not in ('owner', 'admin', 'manager') then
    raise exception 'Only managers can update clients';
  end if;
  if p_name is not null and trim(coalesce(p_name, '')) = '' then
    raise exception 'Name is required';
  end if;
  if p_funding_type is not null and trim(p_funding_type) <> '' and p_funding_type not in ('private', 'local_authority') then
    raise exception 'Invalid funding_type';
  end if;

  update public.clients
  set
    full_name = case when p_name is not null then trim(p_name) else full_name end,
    name = case when p_name is not null then trim(p_name) else name end,
    address = case when p_address is not null then nullif(trim(p_address), '') else address end,
    postcode = case when p_postcode is not null then nullif(trim(p_postcode), '') else postcode end,
    notes = case when p_notes is not null then nullif(trim(p_notes), '') else notes end,
    requires_double_up = coalesce(p_requires_double_up, requires_double_up),
    funding_type = case when p_funding_type is not null then coalesce(nullif(trim(p_funding_type), ''), 'private') else funding_type end
  where id = p_client_id;

  select jsonb_build_object(
    'id', c.id, 'name', coalesce(c.full_name, c.name),
    'address', c.address, 'postcode', c.postcode,
    'notes', c.notes, 'requires_double_up', c.requires_double_up,
    'funding_type', coalesce(c.funding_type, 'private')
  ) into v_row from public.clients c where c.id = p_client_id;
  return v_row;
end;
$$;

revoke all on function public.update_client(uuid, text, text, text, text, boolean, text) from public;
grant execute on function public.update_client(uuid, text, text, text, text, boolean, text) to authenticated;


-- ========== 20260222000000_funders_rates_billing.sql ==========
-- 1) funders table
create table if not exists public.funders (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  type text not null default 'private' check (type in ('private', 'local_authority', 'nhs', 'other')),
  created_at timestamptz not null default now()
);

create index if not exists idx_funders_agency on public.funders(agency_id);
alter table public.funders enable row level security;

-- 2) client_funders table
create table if not exists public.client_funders (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  funder_id uuid not null references public.funders(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(agency_id, client_id)
);

create index if not exists idx_client_funders_agency on public.client_funders(agency_id);
create index if not exists idx_client_funders_client on public.client_funders(client_id);
alter table public.client_funders enable row level security;

-- 3) funder_rates table
create table if not exists public.funder_rates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  funder_id uuid not null references public.funders(id) on delete cascade,
  rate_type text not null check (rate_type in ('standard', 'evening', 'weekend', 'holiday')),
  hourly_rate numeric not null check (hourly_rate >= 0),
  mileage_rate numeric check (mileage_rate is null or mileage_rate >= 0),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  unique(funder_id, rate_type, effective_from)
);

create index if not exists idx_funder_rates_funder on public.funder_rates(funder_id);
create index if not exists idx_funder_rates_dates on public.funder_rates(funder_id, effective_from, effective_to);
alter table public.funder_rates enable row level security;

-- 4) Add mileage_miles to visits
alter table public.visits add column if not exists mileage_miles numeric check (mileage_miles is null or mileage_miles >= 0);

-- RLS: manager+ only for funders, client_funders, funder_rates
-- Use SECURITY DEFINER RPCs for access; restrict direct table access
drop policy if exists "funders_select_manager" on public.funders;
create policy "funders_select_manager" on public.funders for select to authenticated
using (exists (
  select 1 from public.agency_members am
  where am.user_id = auth.uid() and am.agency_id = funders.agency_id
  and am.role in ('owner', 'admin', 'manager')
));

drop policy if exists "client_funders_select_manager" on public.client_funders;
create policy "client_funders_select_manager" on public.client_funders for select to authenticated
using (exists (
  select 1 from public.agency_members am
  where am.user_id = auth.uid() and am.agency_id = client_funders.agency_id
  and am.role in ('owner', 'admin', 'manager')
));

drop policy if exists "funder_rates_select_manager" on public.funder_rates;
create policy "funder_rates_select_manager" on public.funder_rates for select to authenticated
using (exists (
  select 1 from public.agency_members am
  where am.user_id = auth.uid() and am.agency_id = funder_rates.agency_id
  and am.role in ('owner', 'admin', 'manager')
));

-- Insert/update/delete for manager+
drop policy if exists "funders_insert_manager" on public.funders;
create policy "funders_insert_manager" on public.funders for insert to authenticated
with check (exists (
  select 1 from public.agency_members am
  where am.user_id = auth.uid() and am.agency_id = agency_id
  and am.role in ('owner', 'admin', 'manager')
));

drop policy if exists "funders_update_manager" on public.funders;
create policy "funders_update_manager" on public.funders for update to authenticated
using (exists (
  select 1 from public.agency_members am
  where am.user_id = auth.uid() and am.agency_id = agency_id
  and am.role in ('owner', 'admin', 'manager')
));

drop policy if exists "funders_delete_manager" on public.funders;
create policy "funders_delete_manager" on public.funders for delete to authenticated
using (exists (
  select 1 from public.agency_members am
  where am.user_id = auth.uid() and am.agency_id = agency_id
  and am.role in ('owner', 'admin', 'manager')
));

drop policy if exists "client_funders_insert_manager" on public.client_funders;
create policy "client_funders_insert_manager" on public.client_funders for insert to authenticated
with check (exists (
  select 1 from public.agency_members am
  where am.user_id = auth.uid() and am.agency_id = agency_id
  and am.role in ('owner', 'admin', 'manager')
));

drop policy if exists "client_funders_update_manager" on public.client_funders;
create policy "client_funders_update_manager" on public.client_funders for update to authenticated
using (exists (
  select 1 from public.agency_members am
  where am.user_id = auth.uid() and am.agency_id = agency_id
  and am.role in ('owner', 'admin', 'manager')
));

drop policy if exists "client_funders_delete_manager" on public.client_funders;
create policy "client_funders_delete_manager" on public.client_funders for delete to authenticated
using (exists (
  select 1 from public.agency_members am
  where am.user_id = auth.uid() and am.agency_id = agency_id
  and am.role in ('owner', 'admin', 'manager')
));

drop policy if exists "funder_rates_insert_manager" on public.funder_rates;
create policy "funder_rates_insert_manager" on public.funder_rates for insert to authenticated
with check (exists (
  select 1 from public.agency_members am
  where am.user_id = auth.uid() and am.agency_id = agency_id
  and am.role in ('owner', 'admin', 'manager')
));

drop policy if exists "funder_rates_update_manager" on public.funder_rates;
create policy "funder_rates_update_manager" on public.funder_rates for update to authenticated
using (exists (
  select 1 from public.agency_members am
  where am.user_id = auth.uid() and am.agency_id = agency_id
  and am.role in ('owner', 'admin', 'manager')
));

drop policy if exists "funder_rates_delete_manager" on public.funder_rates;
create policy "funder_rates_delete_manager" on public.funder_rates for delete to authenticated
using (exists (
  select 1 from public.agency_members am
  where am.user_id = auth.uid() and am.agency_id = agency_id
  and am.role in ('owner', 'admin', 'manager')
));

-- 5) Extend v_visit_billing: join client->funder->rates, compute care_cost, mileage_cost, total_cost
-- Derive rate_type from visit start_time: weekend (sat/sun), evening (before 8 or after 18), else standard
drop view if exists public.v_visit_billing;
create or replace view public.v_visit_billing as
with base as (
  select
    v.id as visit_id,
    v.agency_id,
    v.client_id,
    v.start_time,
    v.end_time,
    v.actual_start_time,
    v.actual_end_time,
    v.billable_minutes as billable_minutes_override,
    coalesce(
      v.billable_minutes,
      case
        when v.actual_start_time is not null and v.actual_end_time is not null
          and v.actual_end_time > v.actual_start_time
        then extract(epoch from (v.actual_end_time - v.actual_start_time))::integer / 60
        else extract(epoch from (v.end_time - v.start_time))::integer / 60
      end
    )::integer as billable_minutes,
    coalesce(v.mileage_miles, 0) as mileage_miles,
    -- Derive rate_type: weekend (0=Sun, 6=Sat), evening (hour<8 or >=18), else standard
    case
      when extract(dow from v.start_time) in (0, 6) then 'weekend'
      when extract(hour from v.start_time) < 8 or extract(hour from v.start_time) >= 18 then 'evening'
      else 'standard'
    end as rate_type
  from public.visits v
),
with_funder as (
  select b.*,
    cf.funder_id,
    f.name as funder_name,
    f.type as funder_type
  from base b
  left join public.client_funders cf on cf.client_id = b.client_id and cf.agency_id = b.agency_id and cf.active = true
  left join public.funders f on f.id = cf.funder_id
),
with_rates as (
  select wf.*,
    coalesce(
      (select fr.hourly_rate from public.funder_rates fr
       where fr.funder_id = wf.funder_id
         and (wf.start_time)::date >= fr.effective_from
         and (fr.effective_to is null or (wf.start_time)::date <= fr.effective_to)
         and fr.rate_type = wf.rate_type
       order by fr.effective_from desc limit 1),
      (select fr.hourly_rate from public.funder_rates fr
       where fr.funder_id = wf.funder_id
         and (wf.start_time)::date >= fr.effective_from
         and (fr.effective_to is null or (wf.start_time)::date <= fr.effective_to)
         and fr.rate_type = 'standard'
       order by fr.effective_from desc limit 1)
    ) as hourly_rate,
    coalesce(
      (select fr.mileage_rate from public.funder_rates fr
       where fr.funder_id = wf.funder_id
         and (wf.start_time)::date >= fr.effective_from
         and (fr.effective_to is null or (wf.start_time)::date <= fr.effective_to)
         and fr.rate_type = wf.rate_type
       order by fr.effective_from desc limit 1),
      (select fr.mileage_rate from public.funder_rates fr
       where fr.funder_id = wf.funder_id
         and (wf.start_time)::date >= fr.effective_from
         and (fr.effective_to is null or (wf.start_time)::date <= fr.effective_to)
         and fr.rate_type = 'standard'
       order by fr.effective_from desc limit 1)
    ) as mileage_rate
  from with_funder wf
)
select
  visit_id,
  agency_id,
  client_id,
  start_time,
  end_time,
  actual_start_time,
  actual_end_time,
  billable_minutes_override,
  billable_minutes,
  mileage_miles,
  funder_id,
  funder_name,
  funder_type,
  rate_type,
  coalesce(hourly_rate, 0) as hourly_rate,
  coalesce(mileage_rate, 0) as mileage_rate,
  round((billable_minutes::numeric / 60) * coalesce(hourly_rate, 0), 2) as care_cost,
  round(mileage_miles * coalesce(mileage_rate, 0), 2) as mileage_cost,
  round((billable_minutes::numeric / 60) * coalesce(hourly_rate, 0) + mileage_miles * coalesce(mileage_rate, 0), 2) as total_cost
from with_rates;

grant select on public.v_visit_billing to authenticated;

-- RPCs for billing setup and summary (manager+ only)
create or replace function public.list_funders(p_agency_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'Billing access is for managers only'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'type', f.type) order by f.name), '[]'::jsonb)
  into v_rows from public.funders f where f.agency_id = p_agency_id;
  return v_rows;
end;
$$;

create or replace function public.upsert_funder(p_agency_id uuid, p_name text, p_type text default 'private', p_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'Billing access is for managers only'; end if;
  if p_type not in ('private', 'local_authority', 'nhs', 'other') then raise exception 'Invalid type'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'Name is required'; end if;

  if p_id is not null and exists (select 1 from public.funders where id = p_id and agency_id = p_agency_id) then
    update public.funders set name = trim(p_name), type = p_type where id = p_id;
    v_id := p_id;
  else
    insert into public.funders (agency_id, name, type) values (p_agency_id, trim(p_name), p_type) returning id into v_id;
  end if;
  return (select jsonb_build_object('id', f.id, 'name', f.name, 'type', f.type) from public.funders f where f.id = v_id);
end;
$$;

create or replace function public.delete_funder(p_agency_id uuid, p_funder_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'Billing access is for managers only'; end if;
  delete from public.funders where id = p_funder_id and agency_id = p_agency_id;
end;
$$;

create or replace function public.list_funder_rates(p_agency_id uuid, p_funder_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'Billing access is for managers only'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'rate_type', r.rate_type, 'hourly_rate', r.hourly_rate,
    'mileage_rate', r.mileage_rate, 'effective_from', r.effective_from, 'effective_to', r.effective_to
  ) order by r.rate_type, r.effective_from desc), '[]'::jsonb)
  into v_rows from public.funder_rates r where r.funder_id = p_funder_id and r.agency_id = p_agency_id;
  return v_rows;
end;
$$;

create or replace function public.upsert_funder_rate(
  p_agency_id uuid, p_funder_id uuid, p_rate_type text, p_hourly_rate numeric,
  p_effective_from date, p_id uuid default null, p_mileage_rate numeric default null, p_effective_to date default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'Billing access is for managers only'; end if;
  if p_rate_type not in ('standard', 'evening', 'weekend', 'holiday') then raise exception 'Invalid rate_type'; end if;
  if p_hourly_rate is null or p_hourly_rate < 0 then raise exception 'Invalid hourly_rate'; end if;

  if p_id is not null and exists (select 1 from public.funder_rates where id = p_id and funder_id = p_funder_id and agency_id = p_agency_id) then
    update public.funder_rates set rate_type = p_rate_type, hourly_rate = p_hourly_rate, mileage_rate = nullif(p_mileage_rate, 0),
      effective_from = p_effective_from, effective_to = p_effective_to
    where id = p_id;
    v_id := p_id;
  else
    insert into public.funder_rates (agency_id, funder_id, rate_type, hourly_rate, mileage_rate, effective_from, effective_to)
    values (p_agency_id, p_funder_id, p_rate_type, p_hourly_rate, nullif(p_mileage_rate, 0), p_effective_from, p_effective_to)
    returning id into v_id;
  end if;
  return (select jsonb_build_object('id', r.id, 'rate_type', r.rate_type, 'hourly_rate', r.hourly_rate,
    'mileage_rate', r.mileage_rate, 'effective_from', r.effective_from, 'effective_to', r.effective_to)
    from public.funder_rates r where r.id = v_id);
end;
$$;

create or replace function public.list_client_funders(p_agency_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'Billing access is for managers only'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'client_id', cf.client_id, 'client_name', coalesce(c.full_name, c.name),
    'funder_id', cf.funder_id, 'funder_name', f.name, 'active', cf.active
  ) order by coalesce(c.full_name, c.name)), '[]'::jsonb)
  into v_rows
  from public.client_funders cf
  join public.clients c on c.id = cf.client_id and c.deleted_at is null
  join public.funders f on f.id = cf.funder_id
  where cf.agency_id = p_agency_id;
  return v_rows;
end;
$$;

create or replace function public.set_client_funder(p_agency_id uuid, p_client_id uuid, p_funder_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'Billing access is for managers only'; end if;

  insert into public.client_funders (agency_id, client_id, funder_id, active)
  values (p_agency_id, p_client_id, p_funder_id, true)
  on conflict (agency_id, client_id) do update set funder_id = p_funder_id, active = true;
end;
$$;

create or replace function public.clear_client_funder(p_agency_id uuid, p_client_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'Billing access is for managers only'; end if;
  delete from public.client_funders where agency_id = p_agency_id and client_id = p_client_id;
end;
$$;

-- list_billing_summary: grouped by client with totals (manager+ only)
create or replace function public.list_billing_summary(p_agency_id uuid, p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'Billing access is for managers only'; end if;

  select coalesce(jsonb_agg(row order by client_name), '[]'::jsonb) into v_rows
  from (
    select
      vb.client_id,
      coalesce(c.full_name, c.name) as client_name,
      vb.funder_name,
      vb.funder_type,
      sum(vb.billable_minutes)::integer as total_minutes,
      round(sum(vb.care_cost), 2) as total_care_cost,
      round(sum(vb.mileage_cost), 2) as total_mileage_cost,
      round(sum(vb.total_cost), 2) as total_cost,
      count(*)::integer as visit_count
    from public.v_visit_billing vb
    left join public.clients c on c.id = vb.client_id and c.deleted_at is null
    where vb.agency_id = p_agency_id
      and vb.start_time >= p_start
      and vb.start_time < p_end
    group by vb.client_id, coalesce(c.full_name, c.name), vb.funder_name, vb.funder_type
  ) row;
  return v_rows;
end;
$$;

-- Update list_billing_for_range to use new view (include cost fields)
create or replace function public.list_billing_for_range(p_agency_id uuid, p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = p_agency_id limit 1;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'Billing access is for managers only'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'visit_id', r.visit_id, 'client_id', r.client_id, 'client_name', r.client_name,
      'funder_name', r.funder_name, 'funder_type', r.funder_type,
      'start_time', r.start_time, 'end_time', r.end_time,
      'billable_minutes', r.billable_minutes, 'care_cost', r.care_cost,
      'mileage_cost', r.mileage_cost, 'total_cost', r.total_cost
    ) order by r.client_name, r.start_time
  ), '[]'::jsonb) into v_rows
  from (
    select vb.visit_id, vb.client_id, coalesce(c.full_name, c.name) as client_name,
      vb.funder_name, vb.funder_type, vb.start_time, vb.end_time,
      vb.billable_minutes, vb.care_cost, vb.mileage_cost, vb.total_cost
    from public.v_visit_billing vb
    left join public.clients c on c.id = vb.client_id and c.deleted_at is null
    where vb.agency_id = p_agency_id and vb.start_time >= p_start and vb.start_time < p_end
  ) r;
  return v_rows;
end;
$$;

revoke all on function public.list_funders(uuid) from public;
grant execute on function public.list_funders(uuid) to authenticated;
revoke all on function public.upsert_funder(uuid, text, text, uuid) from public;
grant execute on function public.upsert_funder(uuid, text, text, uuid) to authenticated;
revoke all on function public.delete_funder(uuid, uuid) from public;
grant execute on function public.delete_funder(uuid, uuid) to authenticated;
revoke all on function public.list_funder_rates(uuid, uuid) from public;
grant execute on function public.list_funder_rates(uuid, uuid) to authenticated;
revoke all on function public.upsert_funder_rate(uuid, uuid, text, numeric, date, uuid, numeric, date) from public;
grant execute on function public.upsert_funder_rate(uuid, uuid, text, numeric, date, uuid, numeric, date) to authenticated;
revoke all on function public.list_client_funders(uuid) from public;
grant execute on function public.list_client_funders(uuid) to authenticated;
revoke all on function public.set_client_funder(uuid, uuid, uuid) from public;
grant execute on function public.set_client_funder(uuid, uuid, uuid) to authenticated;
revoke all on function public.clear_client_funder(uuid, uuid) from public;
grant execute on function public.clear_client_funder(uuid, uuid) to authenticated;
revoke all on function public.list_billing_summary(uuid, timestamptz, timestamptz) from public;
grant execute on function public.list_billing_summary(uuid, timestamptz, timestamptz) to authenticated;


-- ========== 20260223000000_role_billing_rates.sql ==========
-- Role-dependent billing rates
-- Adds carer_role enum, converts carers.role, creates billing_rates table,
-- rewrites v_visit_billing to per-assignment role-based billing.

-- 1) Create carer_role enum
DO $$ BEGIN
  CREATE TYPE public.carer_role AS ENUM ('carer','senior','nurse','manager');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Convert carers.role from text to carer_role enum
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'carers' AND column_name = 'role'
    AND data_type = 'USER-DEFINED' AND udt_name = 'carer_role'
  ) THEN
    RAISE NOTICE 'carers.role is already carer_role type, skipping conversion';
  ELSE
    UPDATE public.carers SET role = lower(trim(role)) WHERE role IS NOT NULL;
    UPDATE public.carers SET role = 'carer'
      WHERE role IS NULL OR role = '' OR role NOT IN ('carer','senior','nurse','manager');
    ALTER TABLE public.carers ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.carers
      ALTER COLUMN role TYPE public.carer_role USING role::public.carer_role;
    ALTER TABLE public.carers ALTER COLUMN role SET DEFAULT 'carer'::carer_role;
    ALTER TABLE public.carers ALTER COLUMN role SET NOT NULL;
  END IF;
END $$;

-- 3) Create billing_rates table
CREATE TABLE IF NOT EXISTS public.billing_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  funder_id uuid NOT NULL REFERENCES public.funders(id) ON DELETE CASCADE,
  role public.carer_role NOT NULL,
  rate_type text NOT NULL DEFAULT 'hourly',
  amount numeric NOT NULL CHECK (amount >= 0),
  mileage_rate numeric CHECK (mileage_rate IS NULL OR mileage_rate >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_rates_unique
  ON public.billing_rates(agency_id, funder_id, role, rate_type);
CREATE INDEX IF NOT EXISTS idx_billing_rates_funder ON public.billing_rates(funder_id);
ALTER TABLE public.billing_rates ENABLE ROW LEVEL SECURITY;

-- 4) Seed billing_rates from existing funder_rates (standard -> all roles)
INSERT INTO public.billing_rates (agency_id, funder_id, role, rate_type, amount, mileage_rate)
SELECT fr.agency_id, fr.funder_id, r.role, 'hourly', fr.hourly_rate, fr.mileage_rate
FROM public.funder_rates fr
CROSS JOIN (
  VALUES ('carer'::carer_role),('senior'::carer_role),('nurse'::carer_role),('manager'::carer_role)
) AS r(role)
WHERE fr.rate_type = 'standard'
ON CONFLICT DO NOTHING;

-- 5) RLS policies for billing_rates (manager+ only)
DROP POLICY IF EXISTS "billing_rates_select_manager" ON public.billing_rates;
CREATE POLICY "billing_rates_select_manager" ON public.billing_rates FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = billing_rates.agency_id
  AND am.role IN ('owner','admin','manager')
));

DROP POLICY IF EXISTS "billing_rates_insert_manager" ON public.billing_rates;
CREATE POLICY "billing_rates_insert_manager" ON public.billing_rates FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = agency_id
  AND am.role IN ('owner','admin','manager')
));

DROP POLICY IF EXISTS "billing_rates_update_manager" ON public.billing_rates;
CREATE POLICY "billing_rates_update_manager" ON public.billing_rates FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = agency_id
  AND am.role IN ('owner','admin','manager')
));

DROP POLICY IF EXISTS "billing_rates_delete_manager" ON public.billing_rates;
CREATE POLICY "billing_rates_delete_manager" ON public.billing_rates FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = agency_id
  AND am.role IN ('owner','admin','manager')
));

-- 6) list_billing_rates RPC
CREATE OR REPLACE FUNCTION public.list_billing_rates(p_agency_id uuid, p_funder_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_role text; v_rows jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id LIMIT 1;
  IF v_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Billing access is for managers only';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', br.id, 'role', br.role::text, 'rate_type', br.rate_type,
    'amount', br.amount, 'mileage_rate', br.mileage_rate
  ) ORDER BY br.role::text, br.rate_type), '[]'::jsonb)
  INTO v_rows
  FROM public.billing_rates br
  WHERE br.funder_id = p_funder_id AND br.agency_id = p_agency_id;
  RETURN v_rows;
END;
$$;

-- 7) upsert_billing_rate RPC
CREATE OR REPLACE FUNCTION public.upsert_billing_rate(
  p_agency_id uuid, p_funder_id uuid, p_role text, p_amount numeric,
  p_rate_type text DEFAULT 'hourly', p_id uuid DEFAULT NULL, p_mileage_rate numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_member_role text; v_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT am.role INTO v_member_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id LIMIT 1;
  IF v_member_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Billing access is for managers only';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF p_role NOT IN ('carer','senior','nurse','manager') THEN
    RAISE EXCEPTION 'Invalid carer role';
  END IF;

  IF p_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.billing_rates WHERE id = p_id AND funder_id = p_funder_id AND agency_id = p_agency_id
  ) THEN
    UPDATE public.billing_rates
    SET role = p_role::carer_role, rate_type = p_rate_type,
        amount = p_amount, mileage_rate = NULLIF(p_mileage_rate, 0)
    WHERE id = p_id;
    v_id := p_id;
  ELSE
    INSERT INTO public.billing_rates (agency_id, funder_id, role, rate_type, amount, mileage_rate)
    VALUES (p_agency_id, p_funder_id, p_role::carer_role, p_rate_type, p_amount, NULLIF(p_mileage_rate, 0))
    ON CONFLICT (agency_id, funder_id, role, rate_type)
    DO UPDATE SET amount = EXCLUDED.amount, mileage_rate = EXCLUDED.mileage_rate
    RETURNING id INTO v_id;
  END IF;

  RETURN (SELECT jsonb_build_object(
    'id', br.id, 'role', br.role::text, 'rate_type', br.rate_type,
    'amount', br.amount, 'mileage_rate', br.mileage_rate
  ) FROM public.billing_rates br WHERE br.id = v_id);
END;
$$;

-- 8) delete_billing_rate RPC
CREATE OR REPLACE FUNCTION public.delete_billing_rate(p_agency_id uuid, p_rate_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_role text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id LIMIT 1;
  IF v_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Billing access is for managers only';
  END IF;
  DELETE FROM public.billing_rates WHERE id = p_rate_id AND agency_id = p_agency_id;
END;
$$;

-- 9) Rewrite v_visit_billing: per-assignment with role-based rates from billing_rates
DROP VIEW IF EXISTS public.v_visit_billing;
CREATE OR REPLACE VIEW public.v_visit_billing AS
WITH base AS (
  SELECT
    va.id AS assignment_id,
    va.visit_id,
    va.carer_id,
    v.agency_id,
    v.client_id,
    v.start_time,
    v.end_time,
    v.actual_start_time,
    v.actual_end_time,
    v.billable_minutes AS billable_minutes_override,
    COALESCE(v.mileage_miles, 0) AS mileage_miles,
    car.role AS carer_role,
    COALESCE(car.full_name, car.name) AS carer_name,
    COALESCE(
      v.billable_minutes,
      CASE
        WHEN v.actual_start_time IS NOT NULL AND v.actual_end_time IS NOT NULL
          AND v.actual_end_time > v.actual_start_time
        THEN EXTRACT(EPOCH FROM (v.actual_end_time - v.actual_start_time))::integer / 60
        ELSE EXTRACT(EPOCH FROM (v.end_time - v.start_time))::integer / 60
      END
    )::integer AS billable_minutes
  FROM public.visit_assignments va
  JOIN public.visits v ON v.id = va.visit_id
  JOIN public.carers car ON car.id = va.carer_id
),
with_funder AS (
  SELECT b.*,
    cf.funder_id,
    f.name AS funder_name,
    f.type AS funder_type
  FROM base b
  LEFT JOIN public.client_funders cf
    ON cf.client_id = b.client_id AND cf.agency_id = b.agency_id AND cf.active = true
  LEFT JOIN public.funders f ON f.id = cf.funder_id
),
with_rates AS (
  SELECT wf.*,
    COALESCE(br.amount, 0) AS hourly_rate,
    COALESCE(br.mileage_rate, 0) AS mileage_rate
  FROM with_funder wf
  LEFT JOIN public.billing_rates br
    ON br.funder_id = wf.funder_id
    AND br.role = wf.carer_role
    AND br.rate_type = 'hourly'
    AND br.agency_id = wf.agency_id
)
SELECT
  assignment_id,
  visit_id,
  carer_id,
  carer_name,
  carer_role::text AS carer_role,
  agency_id,
  client_id,
  start_time,
  end_time,
  actual_start_time,
  actual_end_time,
  billable_minutes_override,
  billable_minutes,
  mileage_miles,
  funder_id,
  funder_name,
  funder_type,
  hourly_rate,
  mileage_rate,
  ROUND((billable_minutes::numeric / 60) * hourly_rate, 2) AS care_cost,
  ROUND(mileage_miles * mileage_rate, 2) AS mileage_cost,
  ROUND((billable_minutes::numeric / 60) * hourly_rate + mileage_miles * mileage_rate, 2) AS total_cost
FROM with_rates;

GRANT SELECT ON public.v_visit_billing TO authenticated;

-- 10) Update billing summary (now counts distinct visits for joint-visit accuracy)
CREATE OR REPLACE FUNCTION public.list_billing_summary(p_agency_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_role text; v_rows jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id LIMIT 1;
  IF v_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Billing access is for managers only';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY client_name), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      vb.client_id,
      COALESCE(c.full_name, c.name) AS client_name,
      vb.funder_name,
      vb.funder_type,
      SUM(vb.billable_minutes)::integer AS total_minutes,
      ROUND(SUM(vb.care_cost), 2) AS total_care_cost,
      ROUND(SUM(vb.mileage_cost), 2) AS total_mileage_cost,
      ROUND(SUM(vb.total_cost), 2) AS total_cost,
      COUNT(DISTINCT vb.visit_id)::integer AS visit_count
    FROM public.v_visit_billing vb
    LEFT JOIN public.clients c ON c.id = vb.client_id AND c.deleted_at IS NULL
    WHERE vb.agency_id = p_agency_id
      AND vb.start_time >= p_start AND vb.start_time < p_end
    GROUP BY vb.client_id, COALESCE(c.full_name, c.name), vb.funder_name, vb.funder_type
  ) row;
  RETURN v_rows;
END;
$$;

-- 11) Update billing detail range (now includes carer info)
CREATE OR REPLACE FUNCTION public.list_billing_for_range(p_agency_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_role text; v_rows jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id LIMIT 1;
  IF v_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Billing access is for managers only';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'assignment_id', r.assignment_id, 'visit_id', r.visit_id,
      'carer_id', r.carer_id, 'carer_name', r.carer_name, 'carer_role', r.carer_role,
      'client_id', r.client_id, 'client_name', r.client_name,
      'funder_name', r.funder_name, 'funder_type', r.funder_type,
      'start_time', r.start_time, 'end_time', r.end_time,
      'billable_minutes', r.billable_minutes, 'hourly_rate', r.hourly_rate,
      'care_cost', r.care_cost, 'mileage_cost', r.mileage_cost, 'total_cost', r.total_cost
    ) ORDER BY r.client_name, r.start_time, r.carer_name
  ), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT vb.assignment_id, vb.visit_id, vb.carer_id, vb.carer_name, vb.carer_role,
      vb.client_id, COALESCE(c.full_name, c.name) AS client_name,
      vb.funder_name, vb.funder_type, vb.start_time, vb.end_time,
      vb.billable_minutes, vb.hourly_rate, vb.care_cost, vb.mileage_cost, vb.total_cost
    FROM public.v_visit_billing vb
    LEFT JOIN public.clients c ON c.id = vb.client_id AND c.deleted_at IS NULL
    WHERE vb.agency_id = p_agency_id AND vb.start_time >= p_start AND vb.start_time < p_end
  ) r;
  RETURN v_rows;
END;
$$;

-- 12) Update insert_carer to handle carer_role enum
CREATE OR REPLACE FUNCTION public.insert_carer(
  p_agency_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_role text DEFAULT 'carer',
  p_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_carer_id uuid;
  v_row jsonb;
  v_role_val carer_role;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF trim(coalesce(p_name, '')) = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_members WHERE user_id = v_user_id AND agency_id = p_agency_id
  ) THEN RAISE EXCEPTION 'Not authorized for this agency'; END IF;

  BEGIN
    v_role_val := coalesce(nullif(trim(lower(p_role)), ''), 'carer')::carer_role;
  EXCEPTION WHEN invalid_text_representation THEN
    v_role_val := 'carer';
  END;

  INSERT INTO public.carers (agency_id, full_name, name, email, phone, role, active)
  VALUES (
    p_agency_id,
    trim(p_name), trim(p_name),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    v_role_val,
    coalesce(p_active, true)
  )
  RETURNING id INTO v_carer_id;

  SELECT jsonb_build_object(
    'id', c.id, 'name', coalesce(c.full_name, c.name),
    'email', c.email, 'phone', c.phone,
    'role', c.role::text, 'active', c.active
  ) INTO v_row FROM public.carers c WHERE c.id = v_carer_id;
  RETURN v_row;
END;
$$;

-- 13) Update list_carers to explicitly cast role to text
CREATE OR REPLACE FUNCTION public.list_carers(p_agency_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_rows jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_members WHERE user_id = v_user_id AND agency_id = p_agency_id
  ) THEN RAISE EXCEPTION 'Not authorized for this agency'; END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id, 'name', coalesce(c.full_name, c.name),
      'email', c.email, 'phone', c.phone,
      'role', c.role::text, 'active', c.active
    ) ORDER BY coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  INTO v_rows FROM public.carers c WHERE c.agency_id = p_agency_id;
  RETURN v_rows;
END;
$$;

-- 14) list_timesheets: returns payroll timesheets for an agency
CREATE OR REPLACE FUNCTION public.list_timesheets(p_agency_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_role text; v_rows jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT am.role INTO v_role
  FROM public.agency_members am
  WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only admins can view timesheets';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'period_start', t.period_start,
        'period_end', t.period_end,
        'status', t.status,
        'approved_at', t.approved_at,
        'exported_at', t.exported_at,
        'line_count', (
          SELECT count(*) FROM public.timesheet_lines tl WHERE tl.timesheet_id = t.id
        ),
        'total_minutes', (
          SELECT coalesce(sum(tl.total_minutes), 0) FROM public.timesheet_lines tl WHERE tl.timesheet_id = t.id
        )
      )
      ORDER BY t.period_start DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.timesheets t
  WHERE t.agency_id = p_agency_id;

  RETURN v_rows;
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.list_billing_rates(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_billing_rates(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_billing_rate(uuid, uuid, text, numeric, text, uuid, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_billing_rate(uuid, uuid, text, numeric, text, uuid, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_billing_rate(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_billing_rate(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.insert_carer(uuid, text, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.insert_carer(uuid, text, text, text, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.list_carers(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_carers(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_timesheets(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_timesheets(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_billing_summary(uuid, timestamptz, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.list_billing_summary(uuid, timestamptz, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.list_billing_for_range(uuid, timestamptz, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.list_billing_for_range(uuid, timestamptz, timestamptz) TO authenticated;



