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
