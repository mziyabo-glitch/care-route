-- Visits schema: start_time, end_time, status (scheduled|completed|missed), FKs on delete restrict.

-- Add new columns if migrating from scheduled_at
alter table public.visits add column if not exists start_time timestamptz;
alter table public.visits add column if not exists end_time timestamptz;

-- Migrate existing data: scheduled_at -> start_time, end_time (if scheduled_at exists)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'visits' and column_name = 'scheduled_at'
  ) then
    update public.visits
    set start_time = scheduled_at,
        end_time = scheduled_at + interval '1 hour'
    where start_time is null and scheduled_at is not null;
    alter table public.visits drop column scheduled_at;
  end if;
end $$;

-- Backfill any remaining nulls (e.g. empty table) with a default
update public.visits
set start_time = coalesce(start_time, now()),
    end_time = coalesce(end_time, now() + interval '1 hour')
where start_time is null or end_time is null;

-- Set not null
alter table public.visits alter column start_time set not null;
alter table public.visits alter column end_time set not null;

-- Update status constraint: scheduled, completed, missed (map cancelled -> missed)
update public.visits set status = 'missed' where status = 'cancelled';
alter table public.visits drop constraint if exists visits_status_check;
alter table public.visits add constraint visits_status_check
  check (status in ('scheduled', 'completed', 'missed'));

-- Change FKs to ON DELETE RESTRICT
alter table public.visits drop constraint if exists visits_client_id_fkey;
alter table public.visits add constraint visits_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete restrict;

alter table public.visits drop constraint if exists visits_carer_id_fkey;
alter table public.visits add constraint visits_carer_id_fkey
  foreign key (carer_id) references public.carers(id) on delete restrict;

-- Indexes
drop index if exists public.idx_visits_scheduled_at;
create index if not exists idx_visits_start_time on public.visits (start_time);
create index if not exists idx_visits_agency_id on public.visits (agency_id);
create index if not exists idx_visits_client_id on public.visits (client_id);
create index if not exists idx_visits_carer_id on public.visits (carer_id);

-- list_visits: returns visits with client_name, carer_name, ordered by start_time desc
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

revoke all on function public.list_visits(uuid) from public;
grant execute on function public.list_visits(uuid) to authenticated;

-- list_clients_for_selection: id, name for active (non-archived) clients
create or replace function public.list_clients_for_selection(p_agency_id uuid)
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
    jsonb_build_object('id', c.id, 'name', coalesce(c.full_name, c.name))
    order by coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  into v_rows
  from public.clients c
  where c.agency_id = p_agency_id and c.deleted_at is null;
  return v_rows;
end;
$$;

revoke all on function public.list_clients_for_selection(uuid) from public;
grant execute on function public.list_clients_for_selection(uuid) to authenticated;

-- list_carers_for_selection: id, name for active carers only
create or replace function public.list_carers_for_selection(p_agency_id uuid)
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
    jsonb_build_object('id', c.id, 'name', coalesce(c.full_name, c.name))
    order by coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  into v_rows
  from public.carers c
  where c.agency_id = p_agency_id and coalesce(c.active, true) = true;
  return v_rows;
end;
$$;

revoke all on function public.list_carers_for_selection(uuid) from public;
grant execute on function public.list_carers_for_selection(uuid) to authenticated;

-- insert_visit
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
declare v_user_id uuid; v_id uuid; v_row jsonb;
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

revoke all on function public.insert_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text) from public;
grant execute on function public.insert_visit(uuid, uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;

-- update_visit_status
create or replace function public.update_visit_status(p_visit_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_agency_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if p_status is null or p_status not in ('scheduled', 'completed', 'missed') then
    raise exception 'Invalid status';
  end if;
  select v.agency_id into v_agency_id from public.visits v where v.id = p_visit_id;
  if v_agency_id is null then raise exception 'Visit not found'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  update public.visits set status = p_status where id = p_visit_id;
end;
$$;

revoke all on function public.update_visit_status(uuid, text) from public;
grant execute on function public.update_visit_status(uuid, text) to authenticated;

-- delete_visit (hard delete)
create or replace function public.delete_visit(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_agency_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select v.agency_id into v_agency_id from public.visits v where v.id = p_visit_id;
  if v_agency_id is null then raise exception 'Visit not found'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = v_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  delete from public.visits where id = p_visit_id;
end;
$$;

revoke all on function public.delete_visit(uuid) from public;
grant execute on function public.delete_visit(uuid) to authenticated;

-- count_visits_today
create or replace function public.count_visits_today(p_agency_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid; v_count bigint;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.agency_members where user_id = v_user_id and agency_id = p_agency_id) then
    raise exception 'Not authorized for this agency';
  end if;
  select count(*)::bigint into v_count
  from public.visits
  where agency_id = p_agency_id
    and (start_time at time zone 'UTC')::date = (current_timestamp at time zone 'UTC')::date;
  return v_count;
end;
$$;

revoke all on function public.count_visits_today(uuid) from public;
grant execute on function public.count_visits_today(uuid) to authenticated;
