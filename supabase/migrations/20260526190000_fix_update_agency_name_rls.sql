-- Fix "stack depth limit exceeded" when saving agency name.
-- Root cause: direct agencies reads/updates under RLS policies that subquery agency_members
-- can recurse when legacy agencies_select_for_members coexists with member select policies.
-- Pattern: SECURITY DEFINER RPC with inline agency_members check (no get_my_role), bypass RLS on write.

CREATE OR REPLACE FUNCTION public.get_agency_name_for_member(p_agency_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agency_members am
    WHERE am.user_id = v_user_id
      AND am.agency_id = p_agency_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT a.name INTO v_name
  FROM public.agencies a
  WHERE a.id = p_agency_id;

  RETURN NULLIF(trim(coalesce(v_name, '')), '');
END;
$$;

REVOKE ALL ON FUNCTION public.get_agency_name_for_member(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_agency_name_for_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_agency_name(p_agency_id uuid, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_trimmed text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_trimmed := trim(coalesce(p_name, ''));
  IF v_trimmed = '' OR char_length(v_trimmed) > 200 THEN
    RAISE EXCEPTION 'Agency name must be between 1 and 200 characters';
  END IF;

  SELECT am.role INTO v_role
  FROM public.agency_members am
  WHERE am.user_id = v_user_id
    AND am.agency_id = p_agency_id
  LIMIT 1;

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

-- Legacy policy from early multi-tenant migration; duplicates member select and can recurse.
DROP POLICY IF EXISTS "agencies_select_for_members" ON public.agencies;
