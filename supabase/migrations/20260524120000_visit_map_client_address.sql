-- Include client address in list_visits_for_week so visit map avoids direct clients
-- table reads (RLS recursion → "stack depth limit exceeded" in production).

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
      'client_address', c.address,
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

NOTIFY pgrst, 'reload schema';
