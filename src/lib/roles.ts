/** Client-safe role types and helpers (no server imports). */

export type Role = "owner" | "admin" | "manager" | "viewer" | "carer";

const ROLE_LEVEL: Record<Role, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  viewer: 1,
  carer: 0,
};

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

export function canAccessVisitMap(role: Role | null): boolean {
  return canEdit(role);
}

export function canAccessCompliance(role: Role | null): boolean {
  return canEdit(role);
}

export function canWriteCarePlan(role: Role | null): boolean {
  return canEdit(role);
}

export function canViewRestrictedCarePlan(role: Role | null): boolean {
  return canEdit(role);
}

export function canAccessPayroll(role: Role | null): boolean {
  return role === "owner" || role === "admin";
}

export function canAccessBilling(role: Role | null): boolean {
  return canEdit(role);
}

export function isCarerRole(role: Role | null): boolean {
  return role === "carer";
}

export function normalizeRole(raw: string | null | undefined): Role | null {
  if (!raw) return null;
  if (raw === "member") return "viewer";
  if (
    raw === "owner" ||
    raw === "admin" ||
    raw === "manager" ||
    raw === "viewer" ||
    raw === "carer"
  ) {
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
    case "carer":
      return "Carer";
    default:
      return role;
  }
}
