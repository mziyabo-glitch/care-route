-- Visit conflict detection: carer cannot have overlapping visits.

-- insert_visit: check for overlapping visits before insert
create or replace function public.insert_visit(
  p_agency_id uuid,
  p_client_id uuid,
  p_carer_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_status text default 'scheduled',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_id uuid; v_row jsonb; v_conflict boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  if p_status is null or p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;
  if p_end_time < p_start_time then
    raise exception 'End time must be after start time';
  end if;

  select exists (
    select 1 from public.visits v
    where v.carer_id = p_carer_id
      and v.agency_id = p_agency_id
      and v.start_time < p_end_time
      and v.end_time > p_start_time
  ) into v_conflict;
  if v_conflict then
    raise exception 'Carer already has a visit during this time.';
  end if;

  insert into public.visits (agency_id, client_id, carer_id, start_time, end_time, status, notes)
  values (p_agency_id, p_client_id, p_carer_id, p_start_time, p_end_time, p_status, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_id;
  select jsonb_build_object(
    'id', vi.id, 'client_id', vi.client_id, 'carer_id', vi.carer_id,
    'start_time', vi.start_time, 'end_time', vi.end_time, 'status', vi.status, 'notes', vi.notes
  ) into v_row
  from public.visits vi where vi.id = v_id;
  return v_row;
end;
$$;

-- update_visit: full update with overlap check (exclude current visit)
create or replace function public.update_visit(
  p_visit_id uuid,
  p_client_id uuid,
  p_carer_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_status text default null,
  p_notes text default null
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
  if p_end_time < p_start_time then
    raise exception 'End time must be after start time';
  end if;
  if p_status is not null and p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;

  select exists (
    select 1 from public.visits v
    where v.carer_id = p_carer_id
      and v.agency_id = v_agency_id
      and v.id != p_visit_id
      and v.start_time < p_end_time
      and v.end_time > p_start_time
  ) into v_conflict;
  if v_conflict then
    raise exception 'Carer already has a visit during this time.';
  end if;

  update public.visits
  set client_id = p_client_id,
      carer_id = p_carer_id,
      start_time = p_start_time,
      end_time = p_end_time,
      status = coalesce(p_status, status),
      notes = case when p_notes is not null then p_notes else notes end
  where id = p_visit_id;
end;
$$;

revoke all on function public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text) from public;
grant execute on function public.update_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;
