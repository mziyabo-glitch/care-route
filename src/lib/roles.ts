/** Client-safe role types and helpers (no server imports). */

export type Role = "owner" | "admin" | "manager" | "viewer";

const ROLE_LEVEL: Record<Role, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  viewer: 1,
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
