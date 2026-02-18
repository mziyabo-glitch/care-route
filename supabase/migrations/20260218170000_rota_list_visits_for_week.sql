-- list_visits_for_week: visits in [p_week_start, p_week_end), with client/carer names.
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
      'carer_id', v.carer_id,
      'client_name', coalesce(c.full_name, c.name),
      'carer_name', coalesce(cr.full_name, cr.name),
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

revoke all on function public.list_visits_for_week(uuid, timestamptz, timestamptz) from public;
grant execute on function public.list_visits_for_week(uuid, timestamptz, timestamptz) to authenticated;
