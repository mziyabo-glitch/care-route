-- Visit-level care notes (timeline-friendly; multiple per visit). Compliance queries can use this table later.

CREATE TABLE IF NOT EXISTS public.visit_care_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  visit_id uuid NOT NULL REFERENCES public.visits (id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  body text NOT NULL DEFAULT '',
  note_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_care_notes_visit_id ON public.visit_care_notes (visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_care_notes_agency_id ON public.visit_care_notes (agency_id);
CREATE INDEX IF NOT EXISTS idx_visit_care_notes_created_at ON public.visit_care_notes (visit_id, created_at DESC);

ALTER TABLE public.visit_care_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visit_care_notes_select" ON public.visit_care_notes;
CREATE POLICY "visit_care_notes_select"
ON public.visit_care_notes FOR SELECT TO authenticated
USING (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
);

DROP POLICY IF EXISTS "visit_care_notes_insert" ON public.visit_care_notes;
CREATE POLICY "visit_care_notes_insert"
ON public.visit_care_notes FOR INSERT TO authenticated
WITH CHECK (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
);

DROP POLICY IF EXISTS "visit_care_notes_update" ON public.visit_care_notes;
CREATE POLICY "visit_care_notes_update"
ON public.visit_care_notes FOR UPDATE TO authenticated
USING (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
)
WITH CHECK (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
);

DROP POLICY IF EXISTS "visit_care_notes_delete" ON public.visit_care_notes;
CREATE POLICY "visit_care_notes_delete"
ON public.visit_care_notes FOR DELETE TO authenticated
USING (
  agency_id IN (SELECT am.agency_id FROM public.agency_members am WHERE am.user_id = auth.uid())
);

NOTIFY pgrst, 'reload schema';
