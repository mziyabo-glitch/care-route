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
