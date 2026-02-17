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
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_clients_agency_id on public.clients (agency_id);
create index if not exists idx_carers_agency_id on public.carers (agency_id);
create index if not exists idx_visits_agency_id on public.visits (agency_id);
create index if not exists idx_visits_client_id on public.visits (client_id);
create index if not exists idx_visits_carer_id on public.visits (carer_id);
create index if not exists idx_visits_scheduled_at on public.visits (scheduled_at);

alter table public.clients enable row level security;
alter table public.carers enable row level security;
alter table public.visits enable row level security;

-- RLS: membership check via agency_members only (no agencies) to avoid recursion.
create policy "clients_select"
on public.clients for select to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

create policy "clients_insert"
on public.clients for insert to authenticated
with check (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

create policy "clients_update"
on public.clients for update to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
)
with check (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

create policy "clients_delete"
on public.clients for delete to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

create policy "carers_select"
on public.carers for select to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

create policy "carers_insert"
on public.carers for insert to authenticated
with check (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

create policy "carers_update"
on public.carers for update to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
)
with check (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

create policy "carers_delete"
on public.carers for delete to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

create policy "visits_select"
on public.visits for select to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

create policy "visits_insert"
on public.visits for insert to authenticated
with check (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

create policy "visits_update"
on public.visits for update to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
)
with check (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);

create policy "visits_delete"
on public.visits for delete to authenticated
using (
  agency_id in (select agency_id from public.agency_members where user_id = auth.uid())
);
