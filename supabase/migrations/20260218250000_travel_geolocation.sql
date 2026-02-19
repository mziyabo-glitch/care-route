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
