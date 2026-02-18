create or replace function public.insert_carer(
  p_agency_id uuid,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_role text default null,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_carer_id uuid;
  v_row jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Name is required';
  end if;

  if not exists (
    select 1 from public.agency_members
    where user_id = v_user_id and agency_id = p_agency_id
  ) then
    raise exception 'Not authorized for this agency';
  end if;

  insert into public.carers (agency_id, name, email, phone, role, active)
  values (
    p_agency_id,
    trim(p_name),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_role, '')), ''),
    coalesce(p_active, true)
  )
  returning id into v_carer_id;

  select to_jsonb(c) into v_row
  from public.carers c
  where c.id = v_carer_id;

  return v_row;
end;
$$;

revoke all on function public.insert_carer(uuid, text, text, text, text, boolean) from public;
grant execute on function public.insert_carer(uuid, text, text, text, text, boolean) to authenticated;
