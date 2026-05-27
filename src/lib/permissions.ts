import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import { normalizeRole, type Role } from "@/lib/roles";

export type { Role } from "@/lib/roles";
export {
  canAdmin,
  canEdit,
  canView,
  canAccessVisitMap,
  canAccessCompliance,
  canWriteCarePlan,
  canViewRestrictedCarePlan,
  canAccessPayroll,
  canAccessBilling,
  isCarerRole,
  normalizeRole,
  roleLabel,
} from "@/lib/roles";

export async function getCurrentRole(): Promise<{
  agencyId: string | null;
  role: Role | null;
}> {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return { agencyId: null, role: null };

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_role", {
    p_agency_id: agencyId,
  });

  return { agencyId, role: normalizeRole(data as string | null) };
}
