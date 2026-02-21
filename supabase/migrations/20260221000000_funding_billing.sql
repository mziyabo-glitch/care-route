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
create or replace view public.v_visit_billing as
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
