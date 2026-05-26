export const ACTIVE_AGENCY_KEY = "care-route.activeAgencyId";

export type UserAgency = {
  agency_id: string;
  name: string;
  role: string;
  created_at: string;
};

export function resolveAgencyId(
  memberships: UserAgency[],
  preferredId: string | null | undefined
): string | null {
  if (memberships.length === 0) return null;

  if (preferredId && memberships.some((m) => m.agency_id === preferredId)) {
    return preferredId;
  }

  const sorted = [...memberships].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return sorted[0]?.agency_id ?? null;
}
