-- Track when client coordinates were last set (geocode RPC / manual).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

COMMENT ON COLUMN public.clients.geocoded_at IS 'When latitude/longitude were last updated (geocode or admin).';

CREATE OR REPLACE FUNCTION public.update_client_geocode(
  p_client_id uuid,
  p_agency_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clients
  SET latitude = p_latitude,
      longitude = p_longitude,
      geocoded_at = now()
  WHERE id = p_client_id
    AND agency_id = p_agency_id
    AND deleted_at IS NULL;
  RETURN FOUND;
END;
$$;
