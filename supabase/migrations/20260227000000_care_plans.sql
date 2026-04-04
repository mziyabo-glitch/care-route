-- Care plans: client-linked plans and structured sections (MVP slice — no visit notes / compliance yet).

CREATE TABLE IF NOT EXISTS public.care_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  effective_from date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS care_plans_one_active_per_client
  ON public.care_plans (client_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_care_plans_agency_id ON public.care_plans (agency_id);
CREATE INDEX IF NOT EXISTS idx_care_plans_client_id ON public.care_plans (client_id);

CREATE TABLE IF NOT EXISTS public.care_plan_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  care_plan_id uuid NOT NULL REFERENCES public.care_plans (id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  section_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_care_plan_sections_care_plan_id ON public.care_plan_sections (care_plan_id);
CREATE INDEX IF NOT EXISTS idx_care_plan_sections_agency_id ON public.care_plan_sections (agency_id);

ALTER TABLE public.care_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_plan_sections ENABLE ROW LEVEL SECURITY;

-- Same membership model as public.clients: any agency member for that agency_id.

DROP POLICY IF EXISTS "care_plans_select" ON public.care_plans;
CREATE POLICY "care_plans_select"
ON public.care_plans FOR SELECT TO authenticated
USING (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
);

DROP POLICY IF EXISTS "care_plans_insert" ON public.care_plans;
CREATE POLICY "care_plans_insert"
ON public.care_plans FOR INSERT TO authenticated
WITH CHECK (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
);

DROP POLICY IF EXISTS "care_plans_update" ON public.care_plans;
CREATE POLICY "care_plans_update"
ON public.care_plans FOR UPDATE TO authenticated
USING (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
)
WITH CHECK (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
);

DROP POLICY IF EXISTS "care_plans_delete" ON public.care_plans;
CREATE POLICY "care_plans_delete"
ON public.care_plans FOR DELETE TO authenticated
USING (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
);

DROP POLICY IF EXISTS "care_plan_sections_select" ON public.care_plan_sections;
CREATE POLICY "care_plan_sections_select"
ON public.care_plan_sections FOR SELECT TO authenticated
USING (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
);

DROP POLICY IF EXISTS "care_plan_sections_insert" ON public.care_plan_sections;
CREATE POLICY "care_plan_sections_insert"
ON public.care_plan_sections FOR INSERT TO authenticated
WITH CHECK (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
);

DROP POLICY IF EXISTS "care_plan_sections_update" ON public.care_plan_sections;
CREATE POLICY "care_plan_sections_update"
ON public.care_plan_sections FOR UPDATE TO authenticated
USING (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
)
WITH CHECK (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
);

DROP POLICY IF EXISTS "care_plan_sections_delete" ON public.care_plan_sections;
CREATE POLICY "care_plan_sections_delete"
ON public.care_plan_sections FOR DELETE TO authenticated
USING (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
);

NOTIFY pgrst, 'reload schema';
