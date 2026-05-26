-- Allow owner/admin/manager to check in/out on behalf of assigned carers
-- when they are not linked as a carer on the visit themselves.

CREATE OR REPLACE FUNCTION public.check_in(p_visit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_agency_id uuid;
  v_status text;
  v_role text;
  v_carer_ids uuid[];
  v_matched_carer uuid;
  v_source text := 'carer';
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

  SELECT am.role INTO v_role
    FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = v_agency_id
    LIMIT 1;

  SELECT array_agg(c.id) INTO v_carer_ids
    FROM public.carers c WHERE c.user_id = v_user_id AND c.agency_id = v_agency_id;

  SELECT va.carer_id INTO v_matched_carer
    FROM public.visit_assignments va
    WHERE va.visit_id = p_visit_id AND va.carer_id = ANY(v_carer_ids)
    LIMIT 1;

  IF v_matched_carer IS NULL THEN
    IF v_role IN ('owner', 'admin', 'manager') THEN
      SELECT va.carer_id INTO v_matched_carer
        FROM public.visit_assignments va
        WHERE va.visit_id = p_visit_id
        ORDER BY CASE va.role WHEN 'primary' THEN 0 ELSE 1 END
        LIMIT 1;
      IF v_matched_carer IS NULL THEN
        RAISE EXCEPTION 'No carer assigned to this visit';
      END IF;
      v_source := 'admin';
    ELSE
      RAISE EXCEPTION 'You are not assigned to this visit';
    END IF;
  END IF;

  INSERT INTO public.visit_actuals (visit_id, agency_id, check_in_at, check_in_source)
  VALUES (p_visit_id, v_agency_id, now(), v_source)
  ON CONFLICT (visit_id) DO UPDATE SET
    check_in_at = now(), check_in_source = v_source, updated_at = now();

  UPDATE public.visits SET status = 'in_progress' WHERE id = p_visit_id;

  INSERT INTO public.audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
  VALUES (v_agency_id, v_user_id, 'check_in', 'visit', p_visit_id,
    jsonb_build_object('carer_id', v_matched_carer, 'check_in_at', now(), 'source', v_source));

  RETURN jsonb_build_object('ok', true, 'check_in_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.check_out(p_visit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_agency_id uuid;
  v_status text;
  v_role text;
  v_carer_ids uuid[];
  v_matched_carer uuid;
  v_check_in timestamptz;
  v_source text := 'carer';
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

  SELECT am.role INTO v_role
    FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = v_agency_id
    LIMIT 1;

  SELECT array_agg(c.id) INTO v_carer_ids
    FROM public.carers c WHERE c.user_id = v_user_id AND c.agency_id = v_agency_id;

  SELECT va.carer_id INTO v_matched_carer
    FROM public.visit_assignments va
    WHERE va.visit_id = p_visit_id AND va.carer_id = ANY(v_carer_ids)
    LIMIT 1;

  IF v_matched_carer IS NULL THEN
    IF v_role IN ('owner', 'admin', 'manager') THEN
      SELECT va.carer_id INTO v_matched_carer
        FROM public.visit_assignments va
        WHERE va.visit_id = p_visit_id
        ORDER BY CASE va.role WHEN 'primary' THEN 0 ELSE 1 END
        LIMIT 1;
      IF v_matched_carer IS NULL THEN
        RAISE EXCEPTION 'No carer assigned to this visit';
      END IF;
      v_source := 'admin';
    ELSE
      RAISE EXCEPTION 'You are not assigned to this visit';
    END IF;
  END IF;

  UPDATE public.visit_actuals SET
    check_out_at = now(), check_out_source = v_source, updated_at = now()
  WHERE visit_id = p_visit_id;

  UPDATE public.visits SET status = 'completed' WHERE id = p_visit_id;

  INSERT INTO public.audit_logs (agency_id, user_id, action, entity_type, entity_id, details)
  VALUES (v_agency_id, v_user_id, 'check_out', 'visit', p_visit_id,
    jsonb_build_object('carer_id', v_matched_carer, 'check_out_at', now(), 'source', v_source));

  RETURN jsonb_build_object('ok', true, 'check_out_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.check_in(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.check_in(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.check_out(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.check_out(uuid) TO authenticated;
