-- update_client RPC: bypasses RLS to avoid "stack depth limit exceeded" on direct table update
create or replace function public.update_client(
  p_client_id uuid,
  p_name text default null,
  p_address text default null,
  p_postcode text default null,
  p_notes text default null,
  p_requires_double_up boolean default null,
  p_funding_type text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_agency_id uuid; v_role text; v_row jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select c.agency_id into v_agency_id from public.clients c where c.id = p_client_id and c.deleted_at is null;
  if v_agency_id is null then raise exception 'Client not found'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select am.role into v_role from public.agency_members am where am.user_id = v_user_id and am.agency_id = v_agency_id limit 1;
  if v_role not in ('owner', 'admin', 'manager') then
    raise exception 'Only managers can update clients';
  end if;
  if p_name is not null and trim(coalesce(p_name, '')) = '' then
    raise exception 'Name is required';
  end if;
  if p_funding_type is not null and trim(p_funding_type) <> '' and p_funding_type not in ('private', 'local_authority') then
    raise exception 'Invalid funding_type';
  end if;

  update public.clients
  set
    full_name = case when p_name is not null then trim(p_name) else full_name end,
    name = case when p_name is not null then trim(p_name) else name end,
    address = case when p_address is not null then nullif(trim(p_address), '') else address end,
    postcode = case when p_postcode is not null then nullif(trim(p_postcode), '') else postcode end,
    notes = case when p_notes is not null then nullif(trim(p_notes), '') else notes end,
    requires_double_up = coalesce(p_requires_double_up, requires_double_up),
    funding_type = case when p_funding_type is not null then coalesce(nullif(trim(p_funding_type), ''), 'private') else funding_type end
  where id = p_client_id;

  select jsonb_build_object(
    'id', c.id, 'name', coalesce(c.full_name, c.name),
    'address', c.address, 'postcode', c.postcode,
    'notes', c.notes, 'requires_double_up', c.requires_double_up,
    'funding_type', coalesce(c.funding_type, 'private')
  ) into v_row from public.clients c where c.id = p_client_id;
  return v_row;
end;
$$;

revoke all on function public.update_client(uuid, text, text, text, text, boolean, text) from public;
grant execute on function public.update_client(uuid, text, text, text, text, boolean, text) to authenticated;
