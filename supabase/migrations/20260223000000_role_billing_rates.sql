-- Role-dependent billing rates
-- Adds carer_role enum, converts carers.role, creates billing_rates table,
-- rewrites v_visit_billing to per-assignment role-based billing.

-- 1) Create carer_role enum
DO $$ BEGIN
  CREATE TYPE public.carer_role AS ENUM ('carer','senior','nurse','manager');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Convert carers.role from text to carer_role enum
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'carers' AND column_name = 'role'
    AND data_type = 'USER-DEFINED' AND udt_name = 'carer_role'
  ) THEN
    RAISE NOTICE 'carers.role is already carer_role type, skipping conversion';
  ELSE
    UPDATE public.carers SET role = lower(trim(role)) WHERE role IS NOT NULL;
    UPDATE public.carers SET role = 'carer'
      WHERE role IS NULL OR role = '' OR role NOT IN ('carer','senior','nurse','manager');
    ALTER TABLE public.carers ALTER COLUMN role SET DEFAULT 'carer';
    ALTER TABLE public.carers
      ALTER COLUMN role TYPE public.carer_role USING role::public.carer_role;
    ALTER TABLE public.carers ALTER COLUMN role SET NOT NULL;
  END IF;
END $$;

-- 3) Create billing_rates table
CREATE TABLE IF NOT EXISTS public.billing_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  funder_id uuid NOT NULL REFERENCES public.funders(id) ON DELETE CASCADE,
  role public.carer_role NOT NULL,
  rate_type text NOT NULL DEFAULT 'hourly',
  amount numeric NOT NULL CHECK (amount >= 0),
  mileage_rate numeric CHECK (mileage_rate IS NULL OR mileage_rate >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_rates_unique
  ON public.billing_rates(agency_id, funder_id, role, rate_type);
CREATE INDEX IF NOT EXISTS idx_billing_rates_funder ON public.billing_rates(funder_id);
ALTER TABLE public.billing_rates ENABLE ROW LEVEL SECURITY;

-- 4) Seed billing_rates from existing funder_rates (standard -> all roles)
INSERT INTO public.billing_rates (agency_id, funder_id, role, rate_type, amount, mileage_rate)
SELECT fr.agency_id, fr.funder_id, r.role, 'hourly', fr.hourly_rate, fr.mileage_rate
FROM public.funder_rates fr
CROSS JOIN (
  VALUES ('carer'::carer_role),('senior'::carer_role),('nurse'::carer_role),('manager'::carer_role)
) AS r(role)
WHERE fr.rate_type = 'standard'
ON CONFLICT DO NOTHING;

-- 5) RLS policies for billing_rates (manager+ only)
DROP POLICY IF EXISTS "billing_rates_select_manager" ON public.billing_rates;
CREATE POLICY "billing_rates_select_manager" ON public.billing_rates FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = billing_rates.agency_id
  AND am.role IN ('owner','admin','manager')
));

DROP POLICY IF EXISTS "billing_rates_insert_manager" ON public.billing_rates;
CREATE POLICY "billing_rates_insert_manager" ON public.billing_rates FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = agency_id
  AND am.role IN ('owner','admin','manager')
));

DROP POLICY IF EXISTS "billing_rates_update_manager" ON public.billing_rates;
CREATE POLICY "billing_rates_update_manager" ON public.billing_rates FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = agency_id
  AND am.role IN ('owner','admin','manager')
));

DROP POLICY IF EXISTS "billing_rates_delete_manager" ON public.billing_rates;
CREATE POLICY "billing_rates_delete_manager" ON public.billing_rates FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = agency_id
  AND am.role IN ('owner','admin','manager')
));

-- 6) list_billing_rates RPC
CREATE OR REPLACE FUNCTION public.list_billing_rates(p_agency_id uuid, p_funder_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_role text; v_rows jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id LIMIT 1;
  IF v_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Billing access is for managers only';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', br.id, 'role', br.role::text, 'rate_type', br.rate_type,
    'amount', br.amount, 'mileage_rate', br.mileage_rate
  ) ORDER BY br.role::text, br.rate_type), '[]'::jsonb)
  INTO v_rows
  FROM public.billing_rates br
  WHERE br.funder_id = p_funder_id AND br.agency_id = p_agency_id;
  RETURN v_rows;
END;
$$;

-- 7) upsert_billing_rate RPC
CREATE OR REPLACE FUNCTION public.upsert_billing_rate(
  p_agency_id uuid, p_funder_id uuid, p_role text, p_amount numeric,
  p_rate_type text DEFAULT 'hourly', p_id uuid DEFAULT NULL, p_mileage_rate numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_member_role text; v_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT am.role INTO v_member_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id LIMIT 1;
  IF v_member_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Billing access is for managers only';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF p_role NOT IN ('carer','senior','nurse','manager') THEN
    RAISE EXCEPTION 'Invalid carer role';
  END IF;

  IF p_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.billing_rates WHERE id = p_id AND funder_id = p_funder_id AND agency_id = p_agency_id
  ) THEN
    UPDATE public.billing_rates
    SET role = p_role::carer_role, rate_type = p_rate_type,
        amount = p_amount, mileage_rate = NULLIF(p_mileage_rate, 0)
    WHERE id = p_id;
    v_id := p_id;
  ELSE
    INSERT INTO public.billing_rates (agency_id, funder_id, role, rate_type, amount, mileage_rate)
    VALUES (p_agency_id, p_funder_id, p_role::carer_role, p_rate_type, p_amount, NULLIF(p_mileage_rate, 0))
    ON CONFLICT (agency_id, funder_id, role, rate_type)
    DO UPDATE SET amount = EXCLUDED.amount, mileage_rate = EXCLUDED.mileage_rate
    RETURNING id INTO v_id;
  END IF;

  RETURN (SELECT jsonb_build_object(
    'id', br.id, 'role', br.role::text, 'rate_type', br.rate_type,
    'amount', br.amount, 'mileage_rate', br.mileage_rate
  ) FROM public.billing_rates br WHERE br.id = v_id);
END;
$$;

-- 8) delete_billing_rate RPC
CREATE OR REPLACE FUNCTION public.delete_billing_rate(p_agency_id uuid, p_rate_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_role text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id LIMIT 1;
  IF v_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Billing access is for managers only';
  END IF;
  DELETE FROM public.billing_rates WHERE id = p_rate_id AND agency_id = p_agency_id;
END;
$$;

-- 9) Rewrite v_visit_billing: per-assignment with role-based rates from billing_rates
DROP VIEW IF EXISTS public.v_visit_billing;
CREATE OR REPLACE VIEW public.v_visit_billing AS
WITH base AS (
  SELECT
    va.id AS assignment_id,
    va.visit_id,
    va.carer_id,
    v.agency_id,
    v.client_id,
    v.start_time,
    v.end_time,
    v.actual_start_time,
    v.actual_end_time,
    v.billable_minutes AS billable_minutes_override,
    COALESCE(v.mileage_miles, 0) AS mileage_miles,
    car.role AS carer_role,
    COALESCE(car.full_name, car.name) AS carer_name,
    COALESCE(
      v.billable_minutes,
      CASE
        WHEN v.actual_start_time IS NOT NULL AND v.actual_end_time IS NOT NULL
          AND v.actual_end_time > v.actual_start_time
        THEN EXTRACT(EPOCH FROM (v.actual_end_time - v.actual_start_time))::integer / 60
        ELSE EXTRACT(EPOCH FROM (v.end_time - v.start_time))::integer / 60
      END
    )::integer AS billable_minutes
  FROM public.visit_assignments va
  JOIN public.visits v ON v.id = va.visit_id
  JOIN public.carers car ON car.id = va.carer_id
),
with_funder AS (
  SELECT b.*,
    cf.funder_id,
    f.name AS funder_name,
    f.type AS funder_type
  FROM base b
  LEFT JOIN public.client_funders cf
    ON cf.client_id = b.client_id AND cf.agency_id = b.agency_id AND cf.active = true
  LEFT JOIN public.funders f ON f.id = cf.funder_id
),
with_rates AS (
  SELECT wf.*,
    COALESCE(br.amount, 0) AS hourly_rate,
    COALESCE(br.mileage_rate, 0) AS mileage_rate
  FROM with_funder wf
  LEFT JOIN public.billing_rates br
    ON br.funder_id = wf.funder_id
    AND br.role = wf.carer_role
    AND br.rate_type = 'hourly'
    AND br.agency_id = wf.agency_id
)
SELECT
  assignment_id,
  visit_id,
  carer_id,
  carer_name,
  carer_role::text AS carer_role,
  agency_id,
  client_id,
  start_time,
  end_time,
  actual_start_time,
  actual_end_time,
  billable_minutes_override,
  billable_minutes,
  mileage_miles,
  funder_id,
  funder_name,
  funder_type,
  hourly_rate,
  mileage_rate,
  ROUND((billable_minutes::numeric / 60) * hourly_rate, 2) AS care_cost,
  ROUND(mileage_miles * mileage_rate, 2) AS mileage_cost,
  ROUND((billable_minutes::numeric / 60) * hourly_rate + mileage_miles * mileage_rate, 2) AS total_cost
FROM with_rates;

GRANT SELECT ON public.v_visit_billing TO authenticated;

-- 10) Update billing summary (now counts distinct visits for joint-visit accuracy)
CREATE OR REPLACE FUNCTION public.list_billing_summary(p_agency_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_role text; v_rows jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id LIMIT 1;
  IF v_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Billing access is for managers only';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY client_name), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      vb.client_id,
      COALESCE(c.full_name, c.name) AS client_name,
      vb.funder_name,
      vb.funder_type,
      SUM(vb.billable_minutes)::integer AS total_minutes,
      ROUND(SUM(vb.care_cost), 2) AS total_care_cost,
      ROUND(SUM(vb.mileage_cost), 2) AS total_mileage_cost,
      ROUND(SUM(vb.total_cost), 2) AS total_cost,
      COUNT(DISTINCT vb.visit_id)::integer AS visit_count
    FROM public.v_visit_billing vb
    LEFT JOIN public.clients c ON c.id = vb.client_id AND c.deleted_at IS NULL
    WHERE vb.agency_id = p_agency_id
      AND vb.start_time >= p_start AND vb.start_time < p_end
    GROUP BY vb.client_id, COALESCE(c.full_name, c.name), vb.funder_name, vb.funder_type
  ) row;
  RETURN v_rows;
END;
$$;

-- 11) Update billing detail range (now includes carer info)
CREATE OR REPLACE FUNCTION public.list_billing_for_range(p_agency_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_role text; v_rows jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT am.role INTO v_role FROM public.agency_members am
    WHERE am.user_id = v_user_id AND am.agency_id = p_agency_id LIMIT 1;
  IF v_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Billing access is for managers only';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'assignment_id', r.assignment_id, 'visit_id', r.visit_id,
      'carer_id', r.carer_id, 'carer_name', r.carer_name, 'carer_role', r.carer_role,
      'client_id', r.client_id, 'client_name', r.client_name,
      'funder_name', r.funder_name, 'funder_type', r.funder_type,
      'start_time', r.start_time, 'end_time', r.end_time,
      'billable_minutes', r.billable_minutes, 'hourly_rate', r.hourly_rate,
      'care_cost', r.care_cost, 'mileage_cost', r.mileage_cost, 'total_cost', r.total_cost
    ) ORDER BY r.client_name, r.start_time, r.carer_name
  ), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT vb.assignment_id, vb.visit_id, vb.carer_id, vb.carer_name, vb.carer_role,
      vb.client_id, COALESCE(c.full_name, c.name) AS client_name,
      vb.funder_name, vb.funder_type, vb.start_time, vb.end_time,
      vb.billable_minutes, vb.hourly_rate, vb.care_cost, vb.mileage_cost, vb.total_cost
    FROM public.v_visit_billing vb
    LEFT JOIN public.clients c ON c.id = vb.client_id AND c.deleted_at IS NULL
    WHERE vb.agency_id = p_agency_id AND vb.start_time >= p_start AND vb.start_time < p_end
  ) r;
  RETURN v_rows;
END;
$$;

-- 12) Update insert_carer to handle carer_role enum
CREATE OR REPLACE FUNCTION public.insert_carer(
  p_agency_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_role text DEFAULT 'carer',
  p_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_carer_id uuid;
  v_row jsonb;
  v_role_val carer_role;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF trim(coalesce(p_name, '')) = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_members WHERE user_id = v_user_id AND agency_id = p_agency_id
  ) THEN RAISE EXCEPTION 'Not authorized for this agency'; END IF;

  BEGIN
    v_role_val := coalesce(nullif(trim(lower(p_role)), ''), 'carer')::carer_role;
  EXCEPTION WHEN invalid_text_representation THEN
    v_role_val := 'carer';
  END;

  INSERT INTO public.carers (agency_id, full_name, name, email, phone, role, active)
  VALUES (
    p_agency_id,
    trim(p_name), trim(p_name),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    v_role_val,
    coalesce(p_active, true)
  )
  RETURNING id INTO v_carer_id;

  SELECT jsonb_build_object(
    'id', c.id, 'name', coalesce(c.full_name, c.name),
    'email', c.email, 'phone', c.phone,
    'role', c.role::text, 'active', c.active
  ) INTO v_row FROM public.carers c WHERE c.id = v_carer_id;
  RETURN v_row;
END;
$$;

-- 13) Update list_carers to explicitly cast role to text
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
      'role', c.role::text, 'active', c.active
    ) ORDER BY coalesce(c.full_name, c.name)
  ), '[]'::jsonb)
  INTO v_rows FROM public.carers c WHERE c.agency_id = p_agency_id;
  RETURN v_rows;
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.list_billing_rates(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_billing_rates(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_billing_rate(uuid, uuid, text, numeric, text, uuid, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_billing_rate(uuid, uuid, text, numeric, text, uuid, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_billing_rate(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_billing_rate(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.insert_carer(uuid, text, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.insert_carer(uuid, text, text, text, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.list_carers(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_carers(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_billing_summary(uuid, timestamptz, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.list_billing_summary(uuid, timestamptz, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.list_billing_for_range(uuid, timestamptz, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.list_billing_for_range(uuid, timestamptz, timestamptz) TO authenticated;
