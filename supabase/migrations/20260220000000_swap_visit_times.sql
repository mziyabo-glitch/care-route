-- swap_visit_times: swap start/end between two visits (for route reordering).
-- Both visits must be same agency; user must be agency member.
create or replace function public.swap_visit_times(
  p_visit_a_id uuid,
  p_visit_b_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_agency_id uuid;
  v_a record;
  v_b record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select id, agency_id, start_time, end_time into v_a
  from public.visits where id = p_visit_a_id;
  if v_a.id is null then
    raise exception 'Visit A not found';
  end if;

  select id, agency_id, start_time, end_time into v_b
  from public.visits where id = p_visit_b_id;
  if v_b.id is null then
    raise exception 'Visit B not found';
  end if;

  if v_a.agency_id != v_b.agency_id then
    raise exception 'Visits must belong to same agency';
  end if;
  v_agency_id := v_a.agency_id;

  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;

  -- Swap times in a single transaction
  update public.visits set start_time = v_b.start_time, end_time = v_b.end_time where id = p_visit_a_id;
  update public.visits set start_time = v_a.start_time, end_time = v_a.end_time where id = p_visit_b_id;
end;
$$;

revoke all on function public.swap_visit_times(uuid, uuid) from public;
grant execute on function public.swap_visit_times(uuid, uuid) to authenticated;
