-- Visit Risk Engine v1: deterministic, explainable, multi-tenant safe.
-- Risk score 0-100, bands: low (0-30), medium (31-60), high (61-100).

-- 1) visit_risk_scores table
CREATE TABLE IF NOT EXISTS public.visit_risk_scores (
  visit_id uuid PRIMARY KEY REFERENCES public.visits(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  risk_score integer NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_band text NOT NULL CHECK (risk_band IN ('low', 'medium', 'high')),
  factors jsonb NOT NULL DEFAULT '{}',
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_risk_scores_agency ON public.visit_risk_scores(agency_id);
CREATE INDEX IF NOT EXISTS idx_visit_risk_scores_band ON public.visit_risk_scores(risk_band);
CREATE INDEX IF NOT EXISTS idx_visit_risk_scores_calculated ON public.visit_risk_scores(calculated_at);

ALTER TABLE public.visit_risk_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visit_risk_scores_select" ON public.visit_risk_scores;
CREATE POLICY "visit_risk_scores_select" ON public.visit_risk_scores
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_members am
      WHERE am.user_id = auth.uid() AND am.agency_id = visit_risk_scores.agency_id
    )
  );

-- No direct insert/update from client; only RPC (SECURITY DEFINER) can upsert
-- RLS blocks direct writes; RPC uses service role or definer bypass

-- 2) calculate_visit_risk(p_visit_id uuid)
-- Computes 6 factors, upserts visit_risk_scores, returns score/band/factors
CREATE OR REPLACE FUNCTION public.calculate_visit_risk(p_visit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit RECORD;
  v_agency_id uuid;
  v_primary_carer_id uuid;
  v_visit_date date;
  v_lateness_rate numeric := 0;
  v_lateness_points numeric := 0;
  v_travel_minutes integer := 0;
  v_travel_points numeric := 0;
  v_visits_today integer := 0;
  v_visits_today_points integer := 0;
  v_double_up boolean := false;
  v_double_up_points integer := 0;
  v_new_client boolean := false;
  v_new_client_points integer := 0;
  v_overrun_flag boolean := false;
  v_overrun_points integer := 0;
  v_total numeric := 0;
  v_band text := 'low';
  v_factors jsonb := '{}';
  v_travel_before integer;
  v_prev_client_id uuid;
BEGIN
  -- Load visit and validate
  SELECT v.id, v.agency_id, v.client_id, v.carer_id, v.start_time, v.end_time,
         (v.start_time)::date AS visit_date,
         coalesce(c.requires_double_up, false) AS requires_double_up
  INTO v_visit
  FROM public.visits v
  LEFT JOIN public.clients c ON c.id = v.client_id AND c.deleted_at IS NULL
  WHERE v.id = p_visit_id;

  IF v_visit.id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  v_agency_id := v_visit.agency_id;
  v_visit_date := v_visit.visit_date;

  -- Primary carer: from visit_assignments role=primary, else v.carer_id
  SELECT COALESCE(
    (SELECT va.carer_id FROM public.visit_assignments va
     WHERE va.visit_id = p_visit_id AND va.role = 'primary' LIMIT 1),
    v_visit.carer_id
  ) INTO v_primary_carer_id;

  IF v_primary_carer_id IS NULL THEN
    v_primary_carer_id := v_visit.carer_id;
  END IF;

  -- 1) lateness_rate_14d (0-1) -> up to 30 points
  -- Carer late when check_in_at > start_time by 1+ min; fallback to scheduled if no actuals
  SELECT
    CASE WHEN total = 0 THEN 0 ELSE late::numeric / total END
  INTO v_lateness_rate
  FROM (
    SELECT
      count(*) FILTER (WHERE act.check_in_at IS NOT NULL AND act.check_in_at > v2.start_time + interval '1 minute') AS late,
      count(*) AS total
    FROM public.visits v2
    LEFT JOIN public.visit_actuals act ON act.visit_id = v2.id
    WHERE v2.agency_id = v_agency_id
      AND v2.start_time >= (v_visit_date - interval '14 days')
      AND v2.start_time < (v_visit_date + interval '1 day')
      AND (
        v2.carer_id = v_primary_carer_id
        OR EXISTS (SELECT 1 FROM public.visit_assignments va2 WHERE va2.visit_id = v2.id AND va2.carer_id = v_primary_carer_id)
      )
  ) sub;

  v_lateness_points := least(round((v_lateness_rate * 30)::numeric, 1), 30);

  -- 2) travel_minutes_before_visit (0-45) -> up to 20 points
  -- Get previous visit same day for this carer to compute travel from prev client -> this client
  SELECT v_prev.client_id INTO v_prev_client_id
  FROM public.visits v_prev
  WHERE v_prev.agency_id = v_agency_id
    AND (v_prev.start_time)::date = v_visit_date
    AND v_prev.start_time < v_visit.start_time
    AND (
      v_prev.carer_id = v_primary_carer_id
      OR EXISTS (SELECT 1 FROM public.visit_assignments va2 WHERE va2.visit_id = v_prev.id AND va2.carer_id = v_primary_carer_id)
    )
  ORDER BY v_prev.start_time DESC
  LIMIT 1;

  IF v_prev_client_id IS NOT NULL AND v_prev_client_id != v_visit.client_id THEN
    SELECT tc.travel_minutes INTO v_travel_minutes
    FROM public.travel_cache tc
    WHERE tc.agency_id = v_agency_id
      AND tc.from_client_id = v_prev_client_id
      AND tc.to_client_id = v_visit.client_id
    LIMIT 1;
    IF v_travel_minutes IS NULL THEN
      SELECT tc.travel_minutes INTO v_travel_minutes
      FROM public.travel_cache tc
      WHERE tc.agency_id = v_agency_id
        AND tc.from_client_id = v_visit.client_id
        AND tc.to_client_id = v_prev_client_id
      LIMIT 1;
    END IF;
  END IF;

  v_travel_before := coalesce(v_travel_minutes, 0);
  v_travel_points := least(round(((least(v_travel_before, 45)::numeric / 45) * 20)::numeric, 1), 20);

  -- 3) visits_today (>8) -> +10 points
  SELECT count(DISTINCT v2.id) INTO v_visits_today
  FROM public.visits v2
  WHERE v2.agency_id = v_agency_id
    AND (v2.start_time)::date = v_visit_date
    AND (
      v2.carer_id = v_primary_carer_id
      OR EXISTS (SELECT 1 FROM public.visit_assignments va2 WHERE va2.visit_id = v2.id AND va2.carer_id = v_primary_carer_id)
    );

  v_visits_today_points := CASE WHEN v_visits_today > 8 THEN 10 ELSE 0 END;

  -- 4) requires_double_up -> +10 points
  v_double_up := coalesce(v_visit.requires_double_up, false);
  v_double_up_points := CASE WHEN v_double_up THEN 10 ELSE 0 END;

  -- 5) new_client (first time carer visits client) -> +10 points
  SELECT NOT EXISTS (
    SELECT 1 FROM public.visits v2
    WHERE v2.client_id = v_visit.client_id
      AND v2.id != p_visit_id
      AND (
        v2.carer_id = v_primary_carer_id
        OR EXISTS (SELECT 1 FROM public.visit_assignments va2 WHERE va2.visit_id = v2.id AND va2.carer_id = v_primary_carer_id)
      )
  ) INTO v_new_client;
  v_new_client_points := CASE WHEN v_new_client THEN 10 ELSE 0 END;

  -- 6) overrun_flag (>=3 overruns last 14d, actual > scheduled by 10+ mins) -> +20 points
  SELECT count(*) >= 3 INTO v_overrun_flag
  FROM (
    SELECT 1
    FROM public.visits v2
    LEFT JOIN public.visit_actuals act ON act.visit_id = v2.id
    WHERE v2.agency_id = v_agency_id
      AND v2.start_time >= (v_visit_date - interval '14 days')
      AND v2.start_time < (v_visit_date + interval '1 day')
      AND (
        v2.carer_id = v_primary_carer_id
        OR EXISTS (SELECT 1 FROM public.visit_assignments va2 WHERE va2.visit_id = v2.id AND va2.carer_id = v_primary_carer_id)
      )
      AND act.check_out_at IS NOT NULL
      AND act.check_out_at > v2.end_time + interval '10 minutes'
    LIMIT 4
  ) overruns;

  v_overrun_points := CASE WHEN v_overrun_flag THEN 20 ELSE 0 END;

  -- Total score, cap 0-100
  v_total := greatest(0, least(100,
    v_lateness_points + v_travel_points + v_visits_today_points +
    v_double_up_points + v_new_client_points + v_overrun_points
  ));

  IF v_total <= 30 THEN v_band := 'low';
  ELSIF v_total <= 60 THEN v_band := 'medium';
  ELSE v_band := 'high';
  END IF;

  v_factors := jsonb_build_object(
    'lateness_rate_14d', jsonb_build_object('value', round(v_lateness_rate::numeric, 2), 'points', v_lateness_points),
    'travel_minutes', jsonb_build_object('value', v_travel_before, 'points', v_travel_points),
    'visits_today', jsonb_build_object('value', v_visits_today, 'points', v_visits_today_points),
    'double_up', jsonb_build_object('value', v_double_up, 'points', v_double_up_points),
    'new_client', jsonb_build_object('value', v_new_client, 'points', v_new_client_points),
    'overrun_flag', jsonb_build_object('value', v_overrun_flag, 'points', v_overrun_points)
  );

  INSERT INTO public.visit_risk_scores (visit_id, agency_id, risk_score, risk_band, factors, calculated_at)
  VALUES (p_visit_id, v_agency_id, v_total::integer, v_band, v_factors, now())
  ON CONFLICT (visit_id) DO UPDATE SET
    risk_score = EXCLUDED.risk_score,
    risk_band = EXCLUDED.risk_band,
    factors = EXCLUDED.factors,
    calculated_at = EXCLUDED.calculated_at;

  RETURN jsonb_build_object(
    'risk_score', v_total::integer,
    'risk_band', v_band,
    'factors', v_factors
  );
END;
$$;

-- 3) recalculate_visit_risk_for_range(p_agency_id, p_from, p_to)
CREATE OR REPLACE FUNCTION public.recalculate_visit_risk_for_range(
  p_agency_id uuid,
  p_from date,
  p_to date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_visit_id uuid;
  v_count integer := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT am.role INTO v_role
  FROM public.agency_members am
  WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Only admins and managers can recalculate risk for range';
  END IF;

  FOR v_visit_id IN
    SELECT v.id FROM public.visits v
    WHERE v.agency_id = p_agency_id
      AND (v.start_time)::date >= p_from
      AND (v.start_time)::date <= p_to
  LOOP
    PERFORM public.calculate_visit_risk(v_visit_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 4) get_visit_risk(p_visit_id) - returns score or null if not calculated
CREATE OR REPLACE FUNCTION public.get_visit_risk(p_visit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_agency_id uuid;
  v_row jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT v.agency_id INTO v_agency_id FROM public.visits v WHERE v.id = p_visit_id;
  IF v_agency_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = v_agency_id
  ) THEN
    RAISE EXCEPTION 'Not authorized for this visit';
  END IF;

  SELECT jsonb_build_object(
    'risk_score', rs.risk_score,
    'risk_band', rs.risk_band,
    'factors', rs.factors,
    'calculated_at', rs.calculated_at
  ) INTO v_row
  FROM public.visit_risk_scores rs
  WHERE rs.visit_id = p_visit_id;

  RETURN v_row;
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.calculate_visit_risk(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.calculate_visit_risk(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.recalculate_visit_risk_for_range(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.recalculate_visit_risk_for_range(uuid, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_visit_risk(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_visit_risk(uuid) TO authenticated;

-- 5) Update list_visits_for_week to include risk_score, risk_band, factors
CREATE OR REPLACE FUNCTION public.list_visits_for_week(
  p_agency_id uuid,
  p_week_start timestamptz,
  p_week_end timestamptz
)
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
      'client_name', coalesce(c.full_name, c.name),
      'client_postcode', c.postcode,
      'client_lat', c.latitude,
      'client_lng', c.longitude,
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
      'start_time', v.start_time,
      'end_time', v.end_time,
      'status', v.status,
      'notes', v.notes,
      'risk_score', rs.risk_score,
      'risk_band', rs.risk_band,
      'risk_factors', rs.factors
    ) ORDER BY v.start_time
  ), '[]'::jsonb)
  INTO v_rows
  FROM public.visits v
  LEFT JOIN public.clients c ON c.id = v.client_id AND c.deleted_at IS NULL
  LEFT JOIN public.carers cr ON cr.id = v.carer_id
  LEFT JOIN public.visit_risk_scores rs ON rs.visit_id = v.id
  WHERE v.agency_id = p_agency_id
    AND v.start_time >= p_week_start
    AND v.start_time < p_week_end
    AND (v_role != 'carer' OR EXISTS (
      SELECT 1 FROM public.visit_assignments va
      WHERE va.visit_id = v.id AND va.carer_id = ANY(public.get_my_carer_ids(p_agency_id))
    ));
  RETURN v_rows;
END;
$$;

-- 6) Update list_visits to include risk
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
      'break_minutes', act.break_minutes,
      'risk_score', rs.risk_score,
      'risk_band', rs.risk_band,
      'risk_factors', rs.factors
    ) ORDER BY v.start_time DESC
  ), '[]'::jsonb)
  INTO v_rows
  FROM public.visits v
  LEFT JOIN public.clients c ON c.id = v.client_id AND c.deleted_at IS NULL
  LEFT JOIN public.carers cr ON cr.id = v.carer_id
  LEFT JOIN public.visit_actuals act ON act.visit_id = v.id
  LEFT JOIN public.visit_risk_scores rs ON rs.visit_id = v.id
  WHERE v.agency_id = p_agency_id
    AND (v_role != 'carer' OR EXISTS (
      SELECT 1 FROM public.visit_assignments va
      WHERE va.visit_id = v.id AND va.carer_id = ANY(public.get_my_carer_ids(p_agency_id))
    ));
  RETURN v_rows;
END;
$$;

NOTIFY pgrst, 'reload schema';
