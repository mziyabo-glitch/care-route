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
