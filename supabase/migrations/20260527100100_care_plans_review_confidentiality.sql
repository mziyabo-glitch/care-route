-- Care plan review governance and section-level confidentiality.

ALTER TABLE public.care_plans
  ADD COLUMN IF NOT EXISTS review_due_date date,
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confidentiality_level text NOT NULL DEFAULT 'standard';

ALTER TABLE public.care_plans
  DROP CONSTRAINT IF EXISTS care_plans_confidentiality_level_check;

ALTER TABLE public.care_plans
  ADD CONSTRAINT care_plans_confidentiality_level_check
  CHECK (confidentiality_level IN ('standard', 'restricted'));

CREATE INDEX IF NOT EXISTS idx_care_plans_review_due
  ON public.care_plans (agency_id, review_due_date)
  WHERE status IN ('draft', 'active');

ALTER TABLE public.care_plan_sections
  ADD COLUMN IF NOT EXISTS confidentiality_level text NOT NULL DEFAULT 'standard';

ALTER TABLE public.care_plan_sections
  DROP CONSTRAINT IF EXISTS care_plan_sections_confidentiality_level_check;

ALTER TABLE public.care_plan_sections
  ADD CONSTRAINT care_plan_sections_confidentiality_level_check
  CHECK (confidentiality_level IN ('standard', 'restricted'));

-- Confidential notes template section defaults to restricted when created via app.
UPDATE public.care_plan_sections
SET confidentiality_level = 'restricted'
WHERE section_key = 'confidential_notes'
  AND confidentiality_level = 'standard';

NOTIFY pgrst, 'reload schema';
