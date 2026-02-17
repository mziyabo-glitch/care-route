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
