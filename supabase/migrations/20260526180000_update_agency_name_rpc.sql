-- Allow owner/admin/manager to rename their agency (membership-checked).

CREATE OR REPLACE FUNCTION public.update_agency_name(p_agency_id uuid, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_trimmed text;
BEGIN
  v_trimmed := trim(coalesce(p_name, ''));
  IF v_trimmed = '' OR char_length(v_trimmed) > 200 THEN
    RAISE EXCEPTION 'Agency name must be between 1 and 200 characters';
  END IF;

  v_role := public.get_my_role(p_agency_id);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Insufficient permissions to update agency name';
  END IF;

  UPDATE public.agencies
  SET name = v_trimmed
  WHERE id = p_agency_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency not found';
  END IF;

  RETURN jsonb_build_object('id', p_agency_id, 'name', v_trimmed);
END;
$$;

REVOKE ALL ON FUNCTION public.update_agency_name(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.update_agency_name(uuid, text) TO authenticated;
