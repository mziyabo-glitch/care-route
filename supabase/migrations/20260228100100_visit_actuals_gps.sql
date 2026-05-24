-- Optional check-in/out GPS for visit map distance warnings (no live tracking).
ALTER TABLE public.visit_actuals
  ADD COLUMN IF NOT EXISTS check_in_latitude numeric,
  ADD COLUMN IF NOT EXISTS check_in_longitude numeric,
  ADD COLUMN IF NOT EXISTS check_out_latitude numeric,
  ADD COLUMN IF NOT EXISTS check_out_longitude numeric;
