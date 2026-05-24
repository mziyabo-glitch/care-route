import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";

export type Role = "owner" | "admin" | "manager" | "viewer";

const ROLE_LEVEL: Record<Role, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  viewer: 1,
};

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

export function canAdmin(role: Role | null): boolean {
  if (!role) return false;
  return ROLE_LEVEL[role] >= ROLE_LEVEL.admin;
}

export function canEdit(role: Role | null): boolean {
  if (!role) return false;
  return ROLE_LEVEL[role] >= ROLE_LEVEL.manager;
}

export function canView(role: Role | null): boolean {
  return role !== null;
}

/** Visit map and billing: owner, admin, manager (not viewer/carer). */
export function canAccessVisitMap(role: Role | null): boolean {
  return canEdit(role);
}

/** Compliance dashboard: same roles as visit map / billing. */
export function canAccessCompliance(role: Role | null): boolean {
  return canEdit(role);
}

/** Map legacy DB role values to the app Role union. */
export function normalizeRole(raw: string | null | undefined): Role | null {
  if (!raw) return null;
  if (raw === "member") return "viewer";
  if (raw === "owner" || raw === "admin" || raw === "manager" || raw === "viewer") {
    return raw;
  }
  return null;
}

export function roleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "manager":
      return "Manager";
    case "viewer":
      return "Viewer";
    default:
      return role;
  }
}
