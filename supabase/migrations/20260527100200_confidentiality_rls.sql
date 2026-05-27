-- Strengthen least-privilege: carers assigned-only; restricted sections manager+.

CREATE OR REPLACE FUNCTION public.is_agency_manager_plus(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = p_agency_id
      AND am.role IN ('owner', 'admin', 'manager')
  );
$$;

REVOKE ALL ON FUNCTION public.is_agency_manager_plus(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_agency_manager_plus(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.carer_can_access_client(p_agency_id uuid, p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.visits v
    JOIN public.visit_assignments va ON va.visit_id = v.id
    WHERE v.agency_id = p_agency_id
      AND v.client_id = p_client_id
      AND va.carer_id = ANY (public.get_my_carer_ids(p_agency_id))
  );
$$;

REVOKE ALL ON FUNCTION public.carer_can_access_client(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carer_can_access_client(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.carer_can_access_visit(p_agency_id uuid, p_visit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.visit_assignments va
    JOIN public.visits v ON v.id = va.visit_id
    WHERE v.id = p_visit_id
      AND v.agency_id = p_agency_id
      AND va.carer_id = ANY (public.get_my_carer_ids(p_agency_id))
  );
$$;

REVOKE ALL ON FUNCTION public.carer_can_access_visit(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carer_can_access_visit(uuid, uuid) TO authenticated;

-- care_plans: carers only for assigned clients; writes manager+

DROP POLICY IF EXISTS "care_plans_select" ON public.care_plans;
CREATE POLICY "care_plans_select"
ON public.care_plans FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = care_plans.agency_id
      AND (
        am.role IN ('owner', 'admin', 'manager', 'viewer')
        OR public.carer_can_access_client(care_plans.agency_id, care_plans.client_id)
      )
  )
);

DROP POLICY IF EXISTS "care_plans_insert" ON public.care_plans;
CREATE POLICY "care_plans_insert"
ON public.care_plans FOR INSERT TO authenticated
WITH CHECK (public.is_agency_manager_plus(agency_id));

DROP POLICY IF EXISTS "care_plans_update" ON public.care_plans;
CREATE POLICY "care_plans_update"
ON public.care_plans FOR UPDATE TO authenticated
USING (public.is_agency_manager_plus(agency_id))
WITH CHECK (public.is_agency_manager_plus(agency_id));

DROP POLICY IF EXISTS "care_plans_delete" ON public.care_plans;
CREATE POLICY "care_plans_delete"
ON public.care_plans FOR DELETE TO authenticated
USING (public.is_agency_manager_plus(agency_id));

-- care_plan_sections: restricted hidden from carers; carers need client assignment

DROP POLICY IF EXISTS "care_plan_sections_select" ON public.care_plan_sections;
CREATE POLICY "care_plan_sections_select"
ON public.care_plan_sections FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = care_plan_sections.agency_id
      AND (
        am.role IN ('owner', 'admin', 'manager')
        OR (
          am.role IN ('viewer', 'carer')
          AND care_plan_sections.confidentiality_level = 'standard'
          AND (
            am.role = 'viewer'
            OR EXISTS (
              SELECT 1 FROM public.care_plans cp
              WHERE cp.id = care_plan_sections.care_plan_id
                AND public.carer_can_access_client(cp.agency_id, cp.client_id)
            )
          )
        )
      )
  )
);

DROP POLICY IF EXISTS "care_plan_sections_insert" ON public.care_plan_sections;
CREATE POLICY "care_plan_sections_insert"
ON public.care_plan_sections FOR INSERT TO authenticated
WITH CHECK (public.is_agency_manager_plus(agency_id));

DROP POLICY IF EXISTS "care_plan_sections_update" ON public.care_plan_sections;
CREATE POLICY "care_plan_sections_update"
ON public.care_plan_sections FOR UPDATE TO authenticated
USING (public.is_agency_manager_plus(agency_id))
WITH CHECK (public.is_agency_manager_plus(agency_id));

DROP POLICY IF EXISTS "care_plan_sections_delete" ON public.care_plan_sections;
CREATE POLICY "care_plan_sections_delete"
ON public.care_plan_sections FOR DELETE TO authenticated
USING (public.is_agency_manager_plus(agency_id));

-- visit_care_notes: carers only on assigned visits; writes remain agency member with visit access

DROP POLICY IF EXISTS "visit_care_notes_select" ON public.visit_care_notes;
CREATE POLICY "visit_care_notes_select"
ON public.visit_care_notes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = visit_care_notes.agency_id
      AND (
        am.role IN ('owner', 'admin', 'manager', 'viewer')
        OR public.carer_can_access_visit(visit_care_notes.agency_id, visit_care_notes.visit_id)
      )
  )
);

DROP POLICY IF EXISTS "visit_care_notes_insert" ON public.visit_care_notes;
CREATE POLICY "visit_care_notes_insert"
ON public.visit_care_notes FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = visit_care_notes.agency_id
      AND (
        am.role IN ('owner', 'admin', 'manager', 'viewer')
        OR public.carer_can_access_visit(visit_care_notes.agency_id, visit_care_notes.visit_id)
      )
  )
);

DROP POLICY IF EXISTS "visit_care_notes_update" ON public.visit_care_notes;
CREATE POLICY "visit_care_notes_update"
ON public.visit_care_notes FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = visit_care_notes.agency_id
      AND (
        am.role IN ('owner', 'admin', 'manager')
        OR (
          am.role = 'carer'
          AND public.carer_can_access_visit(visit_care_notes.agency_id, visit_care_notes.visit_id)
          AND visit_care_notes.author_id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = visit_care_notes.agency_id
      AND (
        am.role IN ('owner', 'admin', 'manager')
        OR (
          am.role = 'carer'
          AND public.carer_can_access_visit(visit_care_notes.agency_id, visit_care_notes.visit_id)
          AND visit_care_notes.author_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "visit_care_notes_delete" ON public.visit_care_notes;
CREATE POLICY "visit_care_notes_delete"
ON public.visit_care_notes FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = visit_care_notes.agency_id
      AND am.role IN ('owner', 'admin', 'manager')
  )
);

NOTIFY pgrst, 'reload schema';
