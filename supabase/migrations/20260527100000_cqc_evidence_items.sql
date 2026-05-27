-- CQC compliance evidence register (agency-scoped, manager+ writes).

CREATE TABLE IF NOT EXISTS public.cqc_evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  category text NOT NULL CHECK (
    category IN ('safe', 'effective', 'caring', 'responsive', 'well_led')
  ),
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  visit_id uuid REFERENCES public.visits (id) ON DELETE SET NULL,
  care_plan_id uuid REFERENCES public.care_plans (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'complete')),
  risk text NOT NULL DEFAULT 'low' CHECK (risk IN ('low', 'medium', 'high')),
  due_date date,
  owner text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cqc_evidence_agency_id ON public.cqc_evidence_items (agency_id);
CREATE INDEX IF NOT EXISTS idx_cqc_evidence_category ON public.cqc_evidence_items (agency_id, category);
CREATE INDEX IF NOT EXISTS idx_cqc_evidence_status ON public.cqc_evidence_items (agency_id, status);
CREATE INDEX IF NOT EXISTS idx_cqc_evidence_due_date ON public.cqc_evidence_items (agency_id, due_date);

ALTER TABLE public.cqc_evidence_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cqc_evidence_select" ON public.cqc_evidence_items;
CREATE POLICY "cqc_evidence_select"
ON public.cqc_evidence_items FOR SELECT TO authenticated
USING (
  agency_id IN (
    SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "cqc_evidence_insert" ON public.cqc_evidence_items;
CREATE POLICY "cqc_evidence_insert"
ON public.cqc_evidence_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = cqc_evidence_items.agency_id
      AND am.role IN ('owner', 'admin', 'manager')
  )
);

DROP POLICY IF EXISTS "cqc_evidence_update" ON public.cqc_evidence_items;
CREATE POLICY "cqc_evidence_update"
ON public.cqc_evidence_items FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = cqc_evidence_items.agency_id
      AND am.role IN ('owner', 'admin', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = cqc_evidence_items.agency_id
      AND am.role IN ('owner', 'admin', 'manager')
  )
);

DROP POLICY IF EXISTS "cqc_evidence_delete" ON public.cqc_evidence_items;
CREATE POLICY "cqc_evidence_delete"
ON public.cqc_evidence_items FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = cqc_evidence_items.agency_id
      AND am.role IN ('owner', 'admin', 'manager')
  )
);

NOTIFY pgrst, 'reload schema';
