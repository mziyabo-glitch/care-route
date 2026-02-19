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
