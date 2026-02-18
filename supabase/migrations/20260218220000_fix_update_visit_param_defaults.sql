-- Fix 42P13: parameters after one with default must also have defaults.
-- Recreate update_visit with required params first, optional params (with defaults) last.

drop function if exists public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid);
drop function if exists public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text);

create or replace function public.update_visit(
  p_visit_id uuid,
  p_client_id uuid,
  p_primary_carer_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_status text default null,
  p_notes text default null,
  p_secondary_carer_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_agency_id uuid; v_conflict boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select v.agency_id into v_agency_id from public.visits v where v.id = p_visit_id;
  if v_agency_id is null then raise exception 'Visit not found'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  if p_primary_carer_id is null then raise exception 'Primary carer is required'; end if;
  if p_secondary_carer_id is not null and p_secondary_carer_id = p_primary_carer_id then
    raise exception 'Secondary carer must be different from primary';
  end if;
  if p_end_time < p_start_time then raise exception 'End time must be after start time'; end if;
  if p_status is not null and p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;

  select exists (
    select 1 from public.visits v
    inner join public.visit_assignments va on va.visit_id = v.id
    where va.carer_id = p_primary_carer_id and v.agency_id = v_agency_id and v.id != p_visit_id
      and v.start_time < p_end_time and v.end_time > p_start_time
  ) into v_conflict;
  if v_conflict then raise exception 'Carer already has a visit during this time.'; end if;

  if p_secondary_carer_id is not null then
    select exists (
      select 1 from public.visits v
      inner join public.visit_assignments va on va.visit_id = v.id
      where va.carer_id = p_secondary_carer_id and v.agency_id = v_agency_id and v.id != p_visit_id
        and v.start_time < p_end_time and v.end_time > p_start_time
    ) into v_conflict;
    if v_conflict then raise exception 'Secondary carer already has a visit during this time.'; end if;
  end if;

  update public.visits
  set client_id = p_client_id, carer_id = p_primary_carer_id, start_time = p_start_time, end_time = p_end_time,
      status = coalesce(p_status, status), notes = case when p_notes is not null then p_notes else notes end
  where id = p_visit_id;

  delete from public.visit_assignments where visit_id = p_visit_id;
  insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
  values (v_agency_id, p_visit_id, p_primary_carer_id, 'primary');
  if p_secondary_carer_id is not null then
    insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
    values (v_agency_id, p_visit_id, p_secondary_carer_id, 'secondary');
  end if;
end;
$$;

revoke all on function public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid) from public;
grant execute on function public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid) to authenticated;
