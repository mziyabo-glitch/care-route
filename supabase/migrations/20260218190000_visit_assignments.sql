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
