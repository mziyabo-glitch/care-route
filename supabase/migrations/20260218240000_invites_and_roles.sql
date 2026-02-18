-- Expand role options on agency_members: owner > admin > manager > viewer
alter table public.agency_members drop constraint if exists agency_members_role_check;
alter table public.agency_members
  add constraint agency_members_role_check
  check (role in ('owner', 'admin', 'manager', 'viewer'));

-- Migrate legacy 'member' role to 'viewer'
update public.agency_members set role = 'viewer' where role = 'member';

-- Agency invites table
create table if not exists public.agency_invites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'viewer')),
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_agency_invites_agency on public.agency_invites(agency_id);
create index if not exists idx_agency_invites_token on public.agency_invites(token);

alter table public.agency_invites enable row level security;

-- Only agency admins+ can see invites for their agency
drop policy if exists "invites_select_admin" on public.agency_invites;
create policy "invites_select_admin" on public.agency_invites
for select to authenticated
using (
  exists (
    select 1 from public.agency_members am
    where am.agency_id = agency_invites.agency_id
      and am.user_id = auth.uid()
      and am.role in ('owner', 'admin')
  )
);

-- Only agency admins+ can insert invites
drop policy if exists "invites_insert_admin" on public.agency_invites;
create policy "invites_insert_admin" on public.agency_invites
for insert to authenticated
with check (
  exists (
    select 1 from public.agency_members am
    where am.agency_id = agency_invites.agency_id
      and am.user_id = auth.uid()
      and am.role in ('owner', 'admin')
  )
);

-- Only agency admins+ can delete invites
drop policy if exists "invites_delete_admin" on public.agency_invites;
create policy "invites_delete_admin" on public.agency_invites
for delete to authenticated
using (
  exists (
    select 1 from public.agency_members am
    where am.agency_id = agency_invites.agency_id
      and am.user_id = auth.uid()
      and am.role in ('owner', 'admin')
  )
);

-- Restrict agency_members DELETE to admins+
drop policy if exists "agency_members_delete_admin" on public.agency_members;
create policy "agency_members_delete_admin" on public.agency_members
for delete to authenticated
using (
  exists (
    select 1 from public.agency_members am2
    where am2.agency_id = agency_members.agency_id
      and am2.user_id = auth.uid()
      and am2.role in ('owner', 'admin')
  )
  and agency_members.role != 'owner'
);

-- Allow admin+ to update member roles (but not the owner)
drop policy if exists "agency_members_update_admin" on public.agency_members;
create policy "agency_members_update_admin" on public.agency_members
for update to authenticated
using (
  exists (
    select 1 from public.agency_members am2
    where am2.agency_id = agency_members.agency_id
      and am2.user_id = auth.uid()
      and am2.role in ('owner', 'admin')
  )
  and agency_members.role != 'owner'
)
with check (
  role in ('admin', 'manager', 'viewer')
);

-- RPC: list agency members (agency-scoped)
create or replace function public.list_agency_members(p_agency_id uuid)
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
      'id', am.id,
      'user_id', am.user_id,
      'email', u.email,
      'role', am.role,
      'created_at', am.created_at
    ) order by
      case am.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3 end,
      am.created_at
  ), '[]'::jsonb)
  into v_rows
  from public.agency_members am
  join auth.users u on u.id = am.user_id
  where am.agency_id = p_agency_id;
  return v_rows;
end;
$$;

-- RPC: create invite (admin+ only)
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
  select role into v_role from public.agency_members
    where user_id = v_user_id and agency_id = p_agency_id;
  if v_role is null then raise exception 'Not authorized for this agency'; end if;
  if v_role not in ('owner', 'admin') then raise exception 'Only admins can invite members'; end if;
  if p_role not in ('admin', 'manager', 'viewer') then raise exception 'Invalid role'; end if;
  if trim(coalesce(p_email, '')) = '' then raise exception 'Email is required'; end if;

  -- Check if already a member
  if exists (
    select 1 from public.agency_members am
    join auth.users u on u.id = am.user_id
    where am.agency_id = p_agency_id and lower(u.email) = lower(trim(p_email))
  ) then
    raise exception 'User is already a member of this agency';
  end if;

  insert into public.agency_invites (agency_id, email, role, created_by)
  values (p_agency_id, lower(trim(p_email)), p_role, v_user_id)
  returning jsonb_build_object(
    'id', id, 'token', token, 'email', email,
    'role', role, 'expires_at', expires_at
  ) into v_row;
  return v_row;
end;
$$;

-- RPC: accept invite (anyone authenticated with the token)
create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_invite record; v_email text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select * into v_invite from public.agency_invites
    where token = p_token and accepted_at is null;
  if v_invite is null then raise exception 'Invite not found or already used'; end if;
  if v_invite.expires_at < now() then raise exception 'Invite has expired'; end if;

  -- Verify email matches
  select email into v_email from auth.users where id = v_user_id;
  if lower(v_email) != lower(v_invite.email) then
    raise exception 'This invite was sent to a different email address';
  end if;

  -- Check not already a member
  if exists (select 1 from public.agency_members where agency_id = v_invite.agency_id and user_id = v_user_id) then
    update public.agency_invites set accepted_at = now() where id = v_invite.id;
    return jsonb_build_object('status', 'already_member', 'agency_id', v_invite.agency_id);
  end if;

  insert into public.agency_members (agency_id, user_id, role)
  values (v_invite.agency_id, v_user_id, v_invite.role);

  update public.agency_invites set accepted_at = now() where id = v_invite.id;

  return jsonb_build_object('status', 'accepted', 'agency_id', v_invite.agency_id, 'role', v_invite.role);
end;
$$;

-- RPC: list invites for agency (admin+ only)
create or replace function public.list_invites(p_agency_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_role text; v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select role into v_role from public.agency_members
    where user_id = v_user_id and agency_id = p_agency_id;
  if v_role is null then raise exception 'Not authorized'; end if;
  if v_role not in ('owner', 'admin') then raise exception 'Only admins can view invites'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id, 'email', i.email, 'role', i.role,
      'token', i.token, 'expires_at', i.expires_at,
      'accepted_at', i.accepted_at, 'created_at', i.created_at
    ) order by i.created_at desc
  ), '[]'::jsonb)
  into v_rows
  from public.agency_invites i
  where i.agency_id = p_agency_id;
  return v_rows;
end;
$$;

-- RPC: get current user's role in agency
create or replace function public.get_my_role(p_agency_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_role text;
begin
  select role into v_role from public.agency_members
    where user_id = auth.uid() and agency_id = p_agency_id;
  return v_role;
end;
$$;
