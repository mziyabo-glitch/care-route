-- Insert client via SECURITY DEFINER to avoid RLS recursion/stack depth issues.
-- Also ensures expected columns exist for compatibility.

-- Support both name and full_name (production may use either).
alter table public.clients add column if not exists full_name text;
alter table public.clients add column if not exists name text;
alter table public.clients add column if not exists address text;
alter table public.clients add column if not exists postcode text;
alter table public.clients add column if not exists notes text;

update public.clients set full_name = name where full_name is null and name is not null;
update public.clients set name = full_name where name is null and full_name is not null;

create or replace function public.insert_client(
  p_agency_id uuid,
  p_name text,
  p_address text default null,
  p_postcode text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_client_id uuid;
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

  insert into public.clients (agency_id, full_name, name, address, postcode, notes)
  values (
    p_agency_id,
    trim(p_name),
    trim(p_name),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_postcode, '')), ''),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_client_id;

  select jsonb_build_object(
    'id', c.id,
    'name', coalesce(c.full_name, c.name),
    'address', c.address,
    'postcode', c.postcode,
    'notes', c.notes
  ) into v_row
  from public.clients c
  where c.id = v_client_id;

  return v_row;
end;
$$;

revoke all on function public.insert_client(uuid, text, text, text, text) from public;
grant execute on function public.insert_client(uuid, text, text, text, text) to authenticated;

