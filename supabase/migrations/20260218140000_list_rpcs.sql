-- SECURITY DEFINER list functions to bypass RLS recursion on SELECT.

create or replace function public.list_clients(p_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.agency_members
    where user_id = v_user_id and agency_id = p_agency_id
  ) then
    raise exception 'Not authorized for this agency';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', coalesce(c.full_name, c.name),
      'address', c.address,
      'postcode', c.postcode,
      'notes', c.notes
    ) order by coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  into v_rows
  from public.clients c
  where c.agency_id = p_agency_id;

  return v_rows;
end;
$$;

revoke all on function public.list_clients(uuid) from public;
grant execute on function public.list_clients(uuid) to authenticated;

create or replace function public.list_carers(p_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_rows jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.agency_members
    where user_id = v_user_id and agency_id = p_agency_id
  ) then
    raise exception 'Not authorized for this agency';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', coalesce(c.full_name, c.name),
      'email', c.email,
      'phone', c.phone,
      'role', c.role,
      'active', c.active
    ) order by coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  into v_rows
  from public.carers c
  where c.agency_id = p_agency_id;

  return v_rows;
end;
$$;

revoke all on function public.list_carers(uuid) from public;
grant execute on function public.list_carers(uuid) to authenticated;
