-- insert_visit with joint (secondary carer) support + visit_assignments.
create or replace function public.insert_visit(
  p_agency_id uuid,
  p_client_id uuid,
  p_primary_carer_id uuid,
  p_secondary_carer_id uuid default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
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
  if p_primary_carer_id is null then raise exception 'Primary carer is required'; end if;
  if p_secondary_carer_id = p_primary_carer_id then raise exception 'Secondary carer must be different from primary'; end if;
  if p_status is null or p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;
  if p_end_time < p_start_time then
    raise exception 'End time must be after start time';
  end if;

  -- Overlap check: primary carer
  select exists (
    select 1 from public.visits v
    inner join public.visit_assignments va on va.visit_id = v.id
    where va.carer_id = p_primary_carer_id
      and v.agency_id = p_agency_id
      and v.start_time < p_end_time
      and v.end_time > p_start_time
  ) into v_conflict;
  if v_conflict then raise exception 'Carer already has a visit during this time.'; end if;

  -- Overlap check: secondary carer if present
  if p_secondary_carer_id is not null then
    select exists (
      select 1 from public.visits v
      inner join public.visit_assignments va on va.visit_id = v.id
      where va.carer_id = p_secondary_carer_id
        and v.agency_id = p_agency_id
        and v.start_time < p_end_time
        and v.end_time > p_start_time
    ) into v_conflict;
    if v_conflict then raise exception 'Secondary carer already has a visit during this time.'; end if;
  end if;

  insert into public.visits (agency_id, client_id, carer_id, start_time, end_time, status, notes)
  values (p_agency_id, p_client_id, p_primary_carer_id, p_start_time, p_end_time, p_status, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
  values (p_agency_id, v_id, p_primary_carer_id, 'primary');
  if p_secondary_carer_id is not null then
    insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
    values (p_agency_id, v_id, p_secondary_carer_id, 'secondary');
  end if;

  select jsonb_build_object(
    'id', vi.id, 'client_id', vi.client_id, 'carer_id', vi.carer_id,
    'start_time', vi.start_time, 'end_time', vi.end_time, 'status', vi.status, 'notes', vi.notes
  ) into v_row from public.visits vi where vi.id = v_id;
  return v_row;
end;
$$;

-- Keep backward-compatible wrapper: insert_visit(agency, client, carer, start, end, status, notes)
-- The new signature has p_primary_carer_id and p_secondary_carer_id. We need to support both.
-- Actually the old API passed: p_agency_id, p_client_id, p_carer_id, p_start_time, p_end_time, p_status, p_notes
-- So the param names changed. The API route passes p_carer_id - that maps to p_primary_carer_id. We need p_secondary_carer_id as optional.
-- Let me check - the function now has p_primary_carer_id and p_secondary_carer_id. The API passes carer_id. So we need the API to pass primary and optional secondary. The old insert had p_carer_id. I'll add an overload or make the function accept both. Simpler: rename to p_primary_carer_id in the function but the API can pass it as p_primary_carer_id. Let me update the API to pass p_primary_carer_id and p_secondary_carer_id.

drop function if exists public.insert_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text);
create or replace function public.insert_visit(
  p_agency_id uuid,
  p_client_id uuid,
  p_primary_carer_id uuid,
  p_secondary_carer_id uuid default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
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
  if p_primary_carer_id is null then raise exception 'Primary carer is required'; end if;
  if p_secondary_carer_id is not null and p_secondary_carer_id = p_primary_carer_id then
    raise exception 'Secondary carer must be different from primary';
  end if;
  if p_status is null or p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;
  if p_end_time < p_start_time then
    raise exception 'End time must be after start time';
  end if;

  select exists (
    select 1 from public.visits v
    inner join public.visit_assignments va on va.visit_id = v.id
    where va.carer_id = p_primary_carer_id and v.agency_id = p_agency_id
      and v.start_time < p_end_time and v.end_time > p_start_time
  ) into v_conflict;
  if v_conflict then raise exception 'Carer already has a visit during this time.'; end if;

  if p_secondary_carer_id is not null then
    select exists (
      select 1 from public.visits v
      inner join public.visit_assignments va on va.visit_id = v.id
      where va.carer_id = p_secondary_carer_id and v.agency_id = p_agency_id
        and v.start_time < p_end_time and v.end_time > p_start_time
    ) into v_conflict;
    if v_conflict then raise exception 'Secondary carer already has a visit during this time.'; end if;
  end if;

  insert into public.visits (agency_id, client_id, carer_id, start_time, end_time, status, notes)
  values (p_agency_id, p_client_id, p_primary_carer_id, p_start_time, p_end_time, p_status, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
  values (p_agency_id, v_id, p_primary_carer_id, 'primary');
  if p_secondary_carer_id is not null then
    insert into public.visit_assignments (agency_id, visit_id, carer_id, role)
    values (p_agency_id, v_id, p_secondary_carer_id, 'secondary');
  end if;

  select jsonb_build_object(
    'id', vi.id, 'client_id', vi.client_id, 'carer_id', vi.carer_id,
    'start_time', vi.start_time, 'end_time', vi.end_time, 'status', vi.status, 'notes', vi.notes
  ) into v_row from public.visits vi where vi.id = v_id;
  return v_row;
end;
$$;

revoke all on function public.insert_visit(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text) from public;
grant execute on function public.insert_visit(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;

-- update_visit moved to 20260218220000_fix_update_visit_param_defaults.sql (fixes 42P13 param order)

-- list_visits: include assignments (carer_ids, is_joint)
create or replace function public.list_visits(p_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
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
      'id', v.id,
      'client_id', v.client_id,
      'carer_id', v.carer_id,
      'carer_ids', (select coalesce(jsonb_agg(va.carer_id order by case va.role when 'primary' then 0 else 1 end), '[]') from public.visit_assignments va where va.visit_id = v.id),
      'assignments', (select coalesce(jsonb_agg(
        jsonb_build_object(
          'carer_id', va.carer_id,
          'carer_name', coalesce(cr2.full_name, cr2.name),
          'role', va.role
        ) order by case va.role when 'primary' then 0 else 1 end
      ), '[]') from public.visit_assignments va left join public.carers cr2 on cr2.id = va.carer_id where va.visit_id = v.id),
      'is_joint', (select count(*) >= 2 from public.visit_assignments va where va.visit_id = v.id),
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
  where v.agency_id = p_agency_id;
  return v_rows;
end;
$$;

-- list_visits_for_week: include assignments, client postcode, carer names per assignment
create or replace function public.list_visits_for_week(
  p_agency_id uuid,
  p_week_start timestamptz,
  p_week_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
      'id', v.id,
      'client_id', v.client_id,
      'client_name', coalesce(c.full_name, c.name),
      'client_postcode', c.postcode,
      'carer_id', v.carer_id,
      'carer_ids', (select coalesce(jsonb_agg(va.carer_id order by case va.role when 'primary' then 0 else 1 end), '[]') from public.visit_assignments va where va.visit_id = v.id),
      'assignments', (select coalesce(jsonb_agg(
        jsonb_build_object(
          'carer_id', va.carer_id,
          'carer_name', coalesce(cr2.full_name, cr2.name),
          'role', va.role
        ) order by case va.role when 'primary' then 0 else 1 end
      ), '[]') from public.visit_assignments va left join public.carers cr2 on cr2.id = va.carer_id where va.visit_id = v.id),
      'is_joint', (select count(*) >= 2 from public.visit_assignments va where va.visit_id = v.id),
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
    and v.start_time < p_week_end;
  return v_rows;
end;
$$;
