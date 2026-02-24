-- Visit actuals + payroll + audit logging
-- Adds check-in/check-out, admin adjustments, timesheet generation/approval/export.

-- 1) Expand visits.status to include 'in_progress'
DO $$
DECLARE r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'visits') THEN
    RAISE EXCEPTION 'Table public.visits does not exist. Run earlier migrations first (e.g. 20260218000000, 20260218160000).';
  END IF;

  FOR r IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.visits'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE public.visits DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;

  ALTER TABLE public.visits ADD CONSTRAINT visits_status_check
    CHECK (status IN ('scheduled','in_progress','completed','missed'));
END $$;

-- 2) Add payroll_number to carers
ALTER TABLE public.carers ADD COLUMN IF NOT EXISTS payroll_number text;

-- 3) audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_agency ON public.audit_logs(agency_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 4) visit_actuals
CREATE TABLE IF NOT EXISTS public.visit_actuals (
  visit_id uuid PRIMARY KEY REFERENCES public.visits(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_source text CHECK (check_in_source IN ('carer','admin')),
  check_out_source text CHECK (check_out_source IN ('carer','admin')),
  break_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visit_actuals_agency ON public.visit_actuals(agency_id);
ALTER TABLE public.visit_actuals ENABLE ROW LEVEL SECURITY;

-- 5) visit_adjustments
CREATE TABLE IF NOT EXISTS public.visit_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  visit_id uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  adjusted_field text NOT NULL,
  before_value text,
  after_value text,
  reason text NOT NULL,
  adjusted_by uuid NOT NULL,
  adjusted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visit_adjustments_visit ON public.visit_adjustments(visit_id);
ALTER TABLE public.visit_adjustments ENABLE ROW LEVEL SECURITY;

-- 6) timesheets
CREATE TABLE IF NOT EXISTS public.timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','exported')),
  approved_by uuid,
  approved_at timestamptz,
  exported_by uuid,
  exported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timesheets_agency ON public.timesheets(agency_id);
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;

-- 7) timesheet_lines
CREATE TABLE IF NOT EXISTS public.timesheet_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid NOT NULL REFERENCES public.timesheets(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  carer_id uuid NOT NULL REFERENCES public.carers(id) ON DELETE RESTRICT,
  total_minutes integer NOT NULL,
  total_hours numeric GENERATED ALWAYS AS (total_minutes::numeric / 60) STORED
);
CREATE INDEX IF NOT EXISTS idx_timesheet_lines_timesheet ON public.timesheet_lines(timesheet_id);
ALTER TABLE public.timesheet_lines ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ───

-- audit_logs: admin+ can read their agency's logs
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = audit_logs.agency_id
  AND am.role IN ('owner','admin')
));

-- visit_actuals: agency members can read
DROP POLICY IF EXISTS "visit_actuals_select" ON public.visit_actuals;
CREATE POLICY "visit_actuals_select" ON public.visit_actuals FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = visit_actuals.agency_id
));

-- visit_adjustments: manager+ can read
DROP POLICY IF EXISTS "visit_adjustments_select" ON public.visit_adjustments;
CREATE POLICY "visit_adjustments_select" ON public.visit_adjustments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = visit_adjustments.agency_id
  AND am.role IN ('owner','admin','manager')
));

-- timesheets: admin+ can read
DROP POLICY IF EXISTS "timesheets_select" ON public.timesheets;
CREATE POLICY "timesheets_select" ON public.timesheets FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = timesheets.agency_id
  AND am.role IN ('owner','admin')
));

-- timesheet_lines: admin+ can read
DROP POLICY IF EXISTS "timesheet_lines_select" ON public.timesheet_lines;
CREATE POLICY "timesheet_lines_select" ON public.timesheet_lines FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = timesheet_lines.agency_id
  AND am.role IN ('owner','admin')
));

-- ─── RPCs ───

-- check_in: carer checks into an assigned visit
CREATE OR REPLACE FUNCTION public.check_in(p_visit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid; v_agency_id uuid; v_status text;
  v_carer_ids uuid[]; v_matched_carer uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT v.agency_id, v.status INTO v_agency_id, v_status
    FROM public.visits v WHERE v.id = p_visit_id;
  IF v_agency_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agency_members WHERE user_id = v_user_id AND agency_id = v_agency_id) THEN
    RAISE EXCEPTION 'Not authorized for this agency';
  END IF;

  IF v_status NOT IN ('scheduled') THEN
    RAISE EXCEPTION 'Visit must be in scheduled status to check in';
  END IF;

  SELECT array_agg(c.id) INTO v_carer_ids
    FROM public.carers c WHERE c.user_id = v_user_id AND c.agency_id = v_agency_id;

  SELECT va.carer_id INTO v_matched_carer
    FROM public.visit_assignments va
    WHERE va.visit_id = p_visit_id AND va.carer_id = ANY(v_carer_ids)
    LIMIT 1;

  IF v_matched_carer IS NULL THEN
    RAISE EXCEPTION 'You are not assigned to this visit';
  END IF;

  INSERT INTO public.visit_actuals (visit_id, agency_id, check_in_at, check_in_source)
  VALUES (p_visit_id, v_agency_id, now(), 'carer')
  ON CONFLICT (visit_id) DO UPDATE SET
    check_in_at = now(), check_in_source = 'carer', updated_at = now();

  UPDATE public.visits SET status = 'in_progress' WHERE id = p_visit_id;

  INSERT INTO public.audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
  VALUES (v_agency_id, v_user_id, 'check_in', 'visit', p_visit_id,
    jsonb_build_object('carer_id', v_matched_carer, 'check_in_at', now()));

  RETURN jsonb_build_object('ok', true, 'check_in_at', now());
END;
$$;

-- check_out: carer checks out of an assigned visit
CREATE OR REPLACE FUNCTION public.check_out(p_visit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid; v_agency_id uuid; v_status text;
  v_carer_ids uuid[]; v_matched_carer uuid;
  v_check_in timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT v.agency_id, v.status INTO v_agency_id, v_status
    FROM public.visits v WHERE v.id = p_visit_id;
  IF v_agency_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agency_members WHERE user_id = v_user_id AND agency_id = v_agency_id) THEN
    RAISE EXCEPTION 'Not authorized for this agency';
  END IF;

  IF v_status != 'in_progress' THEN
    RAISE EXCEPTION 'Visit must be in_progress to check out';
  END IF;

  SELECT va_row.check_in_at INTO v_check_in
    FROM public.visit_actuals va_row WHERE va_row.visit_id = p_visit_id;
  IF v_check_in IS NULL THEN
    RAISE EXCEPTION 'No check-in found for this visit';
  END IF;

  SELECT array_agg(c.id) INTO v_carer_ids
    FROM public.carers c WHERE c.user_id = v_user_id AND c.agency_id = v_agency_id;

  SELECT va.carer_id INTO v_matched_carer
    FROM public.visit_assignments va
    WHERE va.visit_id = p_visit_id AND va.carer_id = ANY(v_carer_ids)
    LIMIT 1;

  IF v_matched_carer IS NULL THEN
    RAISE EXCEPTION 'You are not assigned to this visit';
  END IF;

  UPDATE public.visit_actuals SET
    check_out_at = now(), check_out_source = 'carer', updated_at = now()
  WHERE visit_id = p_visit_id;

  UPDATE public.visits SET status = 'completed' WHERE id = p_visit_id;

  INSERT INTO public.audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
  VALUES (v_agency_id, v_user_id, 'check_out', 'visit', p_visit_id,
    jsonb_build_object('carer_id', v_matched_carer, 'check_out_at', now()));

  RETURN jsonb_build_object('ok', true, 'check_out_at', now());
END;
$$;

-- admin_adjust_visit_time: manager+ adjusts visit actuals with audit trail
CREATE OR REPLACE FUNCTION public.admin_adjust_visit_time(
  p_visit_id uuid,
  p_new_check_in timestamptz DEFAULT NULL,
  p_new_check_out timestamptz DEFAULT NULL,
  p_new_break integer DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid; v_agency_id uuid; v_role text;
  v_old visit_actuals%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF trim(coalesce(p_reason, '')) = '' THEN RAISE EXCEPTION 'Reason is required for adjustments'; END IF;

  SELECT v.agency_id INTO v_agency_id FROM public.visits v WHERE v.id = p_visit_id;
  IF v_agency_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = v_agency_id LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Only admins and managers can adjust visit times';
  END IF;

  SELECT * INTO v_old FROM public.visit_actuals WHERE visit_id = p_visit_id;

  IF v_old.visit_id IS NULL THEN
    INSERT INTO public.visit_actuals (visit_id, agency_id, check_in_at, check_out_at, check_in_source, check_out_source, break_minutes)
    VALUES (p_visit_id, v_agency_id, p_new_check_in, p_new_check_out,
      CASE WHEN p_new_check_in IS NOT NULL THEN 'admin' END,
      CASE WHEN p_new_check_out IS NOT NULL THEN 'admin' END,
      coalesce(p_new_break, 0));
    v_old := NULL;
  END IF;

  IF p_new_check_in IS NOT NULL AND (v_old.check_in_at IS NULL OR p_new_check_in != v_old.check_in_at) THEN
    INSERT INTO public.visit_adjustments (agency_id, visit_id, adjusted_field, before_value, after_value, reason, adjusted_by)
    VALUES (v_agency_id, p_visit_id, 'check_in_at', v_old.check_in_at::text, p_new_check_in::text, p_reason, v_user_id);
  END IF;

  IF p_new_check_out IS NOT NULL AND (v_old.check_out_at IS NULL OR p_new_check_out != v_old.check_out_at) THEN
    INSERT INTO public.visit_adjustments (agency_id, visit_id, adjusted_field, before_value, after_value, reason, adjusted_by)
    VALUES (v_agency_id, p_visit_id, 'check_out_at', v_old.check_out_at::text, p_new_check_out::text, p_reason, v_user_id);
  END IF;

  IF p_new_break IS NOT NULL AND p_new_break != coalesce(v_old.break_minutes, 0) THEN
    INSERT INTO public.visit_adjustments (agency_id, visit_id, adjusted_field, before_value, after_value, reason, adjusted_by)
    VALUES (v_agency_id, p_visit_id, 'break_minutes', coalesce(v_old.break_minutes, 0)::text, p_new_break::text, p_reason, v_user_id);
  END IF;

  UPDATE public.visit_actuals SET
    check_in_at = coalesce(p_new_check_in, check_in_at),
    check_out_at = coalesce(p_new_check_out, check_out_at),
    check_in_source = CASE WHEN p_new_check_in IS NOT NULL THEN 'admin' ELSE check_in_source END,
    check_out_source = CASE WHEN p_new_check_out IS NOT NULL THEN 'admin' ELSE check_out_source END,
    break_minutes = coalesce(p_new_break, break_minutes),
    updated_at = now()
  WHERE visit_id = p_visit_id;

  INSERT INTO public.audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
  VALUES (v_agency_id, v_user_id, 'adjust_visit_time', 'visit', p_visit_id,
    jsonb_build_object('reason', p_reason,
      'new_check_in', p_new_check_in, 'new_check_out', p_new_check_out, 'new_break', p_new_break));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- generate_timesheet: creates draft timesheet for a period
CREATE OR REPLACE FUNCTION public.generate_timesheet(
  p_agency_id uuid, p_period_start date, p_period_end date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid; v_role text; v_timesheet_id uuid;
  v_line RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Only admins can generate timesheets';
  END IF;

  INSERT INTO public.timesheets (agency_id, period_start, period_end, status)
  VALUES (p_agency_id, p_period_start, p_period_end, 'draft')
  RETURNING id INTO v_timesheet_id;

  INSERT INTO public.timesheet_lines (timesheet_id, agency_id, carer_id, total_minutes)
  SELECT v_timesheet_id, p_agency_id, va.carer_id,
    SUM(
      CASE WHEN act.check_in_at IS NOT NULL AND act.check_out_at IS NOT NULL
        THEN GREATEST(0, EXTRACT(EPOCH FROM (act.check_out_at - act.check_in_at))::integer / 60 - coalesce(act.break_minutes, 0))
        ELSE EXTRACT(EPOCH FROM (v.end_time - v.start_time))::integer / 60
      END
    )::integer AS total_minutes
  FROM public.visit_assignments va
  JOIN public.visits v ON v.id = va.visit_id AND v.agency_id = p_agency_id
  LEFT JOIN public.visit_actuals act ON act.visit_id = v.id
  WHERE v.start_time::date >= p_period_start
    AND v.start_time::date <= p_period_end
    AND v.status IN ('completed','in_progress','scheduled')
  GROUP BY va.carer_id
  HAVING SUM(
    CASE WHEN act.check_in_at IS NOT NULL AND act.check_out_at IS NOT NULL
      THEN GREATEST(0, EXTRACT(EPOCH FROM (act.check_out_at - act.check_in_at))::integer / 60 - coalesce(act.break_minutes, 0))
      ELSE EXTRACT(EPOCH FROM (v.end_time - v.start_time))::integer / 60
    END
  ) > 0;

  INSERT INTO public.audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_agency_id, v_user_id, 'generate_timesheet', 'timesheet', v_timesheet_id,
    jsonb_build_object('period_start', p_period_start, 'period_end', p_period_end));

  RETURN jsonb_build_object('id', v_timesheet_id);
END;
$$;

-- approve_timesheet
CREATE OR REPLACE FUNCTION public.approve_timesheet(p_timesheet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_agency_id uuid; v_role text; v_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT t.agency_id, t.status INTO v_agency_id, v_status
    FROM public.timesheets t WHERE t.id = p_timesheet_id;
  IF v_agency_id IS NULL THEN RAISE EXCEPTION 'Timesheet not found'; END IF;
  IF v_status != 'draft' THEN RAISE EXCEPTION 'Only draft timesheets can be approved'; END IF;

  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = v_agency_id LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Only admins can approve timesheets';
  END IF;

  UPDATE public.timesheets SET
    status = 'approved', approved_by = v_user_id, approved_at = now()
  WHERE id = p_timesheet_id;

  INSERT INTO public.audit_logs (agency_id, user_id, action, entity_type, entity_id)
  VALUES (v_agency_id, v_user_id, 'approve_timesheet', 'timesheet', p_timesheet_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- list_timesheets: returns timesheets for an agency
CREATE OR REPLACE FUNCTION public.list_timesheets(p_agency_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_role text; v_rows jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Only admins can view timesheets';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'period_start', t.period_start, 'period_end', t.period_end,
    'status', t.status, 'approved_at', t.approved_at, 'exported_at', t.exported_at,
    'line_count', (SELECT count(*) FROM public.timesheet_lines tl WHERE tl.timesheet_id = t.id),
    'total_minutes', (SELECT coalesce(sum(tl.total_minutes), 0) FROM public.timesheet_lines tl WHERE tl.timesheet_id = t.id)
  ) ORDER BY t.period_start DESC), '[]'::jsonb)
  INTO v_rows FROM public.timesheets t WHERE t.agency_id = p_agency_id;
  RETURN v_rows;
END;
$$;

-- get_timesheet_detail: returns timesheet + lines with carer info
CREATE OR REPLACE FUNCTION public.get_timesheet_detail(p_timesheet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_agency_id uuid; v_role text; v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT t.agency_id INTO v_agency_id FROM public.timesheets t WHERE t.id = p_timesheet_id;
  IF v_agency_id IS NULL THEN RAISE EXCEPTION 'Timesheet not found'; END IF;

  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = v_agency_id LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Only admins can view timesheet details';
  END IF;

  SELECT jsonb_build_object(
    'id', t.id, 'period_start', t.period_start, 'period_end', t.period_end,
    'status', t.status, 'approved_at', t.approved_at, 'exported_at', t.exported_at,
    'lines', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', tl.id, 'carer_id', tl.carer_id,
        'carer_name', coalesce(cr.full_name, cr.name),
        'payroll_number', cr.payroll_number,
        'total_minutes', tl.total_minutes,
        'total_hours', tl.total_hours
      ) ORDER BY coalesce(cr.full_name, cr.name))
      FROM public.timesheet_lines tl
      JOIN public.carers cr ON cr.id = tl.carer_id
      WHERE tl.timesheet_id = t.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.timesheets t WHERE t.id = p_timesheet_id;
  RETURN v_result;
END;
$$;

-- Update list_visits to include actuals data
CREATE OR REPLACE FUNCTION public.list_visits(p_agency_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_role text; v_rows jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agency_members WHERE user_id = v_user_id AND agency_id = p_agency_id) THEN
    RAISE EXCEPTION 'Not authorized for this agency';
  END IF;
  SELECT am.role INTO v_role FROM public.agency_members am WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id LIMIT 1;
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'client_id', v.client_id,
      'carer_id', v.carer_id,
      'carer_ids', (SELECT coalesce(jsonb_agg(va.carer_id ORDER BY CASE va.role WHEN 'primary' THEN 0 ELSE 1 END), '[]') FROM public.visit_assignments va WHERE va.visit_id = v.id),
      'assignments', (SELECT coalesce(jsonb_agg(
        jsonb_build_object('carer_id', va.carer_id, 'carer_name', coalesce(cr2.full_name, cr2.name), 'role', va.role)
        ORDER BY CASE va.role WHEN 'primary' THEN 0 ELSE 1 END
      ), '[]') FROM public.visit_assignments va LEFT JOIN public.carers cr2 ON cr2.id = va.carer_id WHERE va.visit_id = v.id),
      'assigned_count', (SELECT count(*) FROM public.visit_assignments va WHERE va.visit_id = v.id),
      'is_joint', (SELECT count(*) >= 2 FROM public.visit_assignments va WHERE va.visit_id = v.id),
      'requires_double_up', coalesce(c.requires_double_up, false),
      'missing_second_carer', (coalesce(c.requires_double_up, false) AND (SELECT count(*) FROM public.visit_assignments va WHERE va.visit_id = v.id) < 2),
      'client_name', coalesce(c.full_name, c.name),
      'carer_name', coalesce(cr.full_name, cr.name),
      'start_time', v.start_time,
      'end_time', v.end_time,
      'status', v.status,
      'notes', v.notes,
      'check_in_at', act.check_in_at,
      'check_out_at', act.check_out_at,
      'break_minutes', act.break_minutes
    ) ORDER BY v.start_time DESC
  ), '[]'::jsonb)
  INTO v_rows
  FROM public.visits v
  LEFT JOIN public.clients c ON c.id = v.client_id AND c.deleted_at IS NULL
  LEFT JOIN public.carers cr ON cr.id = v.carer_id
  LEFT JOIN public.visit_actuals act ON act.visit_id = v.id
  WHERE v.agency_id = p_agency_id
    AND (v_role != 'carer' OR EXISTS (
      SELECT 1 FROM public.visit_assignments va
      WHERE va.visit_id = v.id AND va.carer_id = ANY(public.get_my_carer_ids(p_agency_id))
    ));
  RETURN v_rows;
END;
$$;

-- Update update_visit_status to allow 'in_progress'
CREATE OR REPLACE FUNCTION public.update_visit_status(p_visit_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_agency_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('scheduled','in_progress','completed','missed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  SELECT v.agency_id INTO v_agency_id FROM public.visits v WHERE v.id = p_visit_id;
  IF v_agency_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agency_members WHERE user_id = v_user_id AND agency_id = v_agency_id) THEN
    RAISE EXCEPTION 'Not authorized for this agency';
  END IF;
  UPDATE public.visits SET status = p_status WHERE id = p_visit_id;
END;
$$;

-- get_visit_adjustments: returns adjustment history for a visit
CREATE OR REPLACE FUNCTION public.get_visit_adjustments(p_visit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_agency_id uuid; v_role text; v_rows jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT v.agency_id INTO v_agency_id FROM public.visits v WHERE v.id = p_visit_id;
  IF v_agency_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = v_agency_id LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', adj.id, 'adjusted_field', adj.adjusted_field,
    'before_value', adj.before_value, 'after_value', adj.after_value,
    'reason', adj.reason, 'adjusted_at', adj.adjusted_at
  ) ORDER BY adj.adjusted_at DESC), '[]'::jsonb)
  INTO v_rows FROM public.visit_adjustments adj WHERE adj.visit_id = p_visit_id;
  RETURN v_rows;
END;
$$;

-- Update list_carers to include payroll_number
CREATE OR REPLACE FUNCTION public.list_carers(p_agency_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_rows jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_members WHERE user_id = v_user_id AND agency_id = p_agency_id
  ) THEN RAISE EXCEPTION 'Not authorized for this agency'; END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id, 'name', coalesce(c.full_name, c.name),
      'email', c.email, 'phone', c.phone,
      'role', c.role::text, 'payroll_number', c.payroll_number,
      'active', c.active
    ) ORDER BY coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  INTO v_rows FROM public.carers c WHERE c.agency_id = p_agency_id;
  RETURN v_rows;
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.check_in(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.check_in(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.check_out(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.check_out(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_adjust_visit_time(uuid, timestamptz, timestamptz, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_adjust_visit_time(uuid, timestamptz, timestamptz, integer, text) TO authenticated;
REVOKE ALL ON FUNCTION public.generate_timesheet(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.generate_timesheet(uuid, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_timesheet(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_timesheet(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_timesheets(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_timesheets(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_timesheet_detail(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_timesheet_detail(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_visits(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_visits(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.update_visit_status(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.update_visit_status(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_visit_adjustments(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_visit_adjustments(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_carers(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_carers(uuid) TO authenticated;
