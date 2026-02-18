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
