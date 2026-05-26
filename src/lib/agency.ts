import { cookies } from "next/headers";
import {
  ACTIVE_AGENCY_KEY,
  resolveAgencyId,
  type UserAgency,
} from "@/lib/agency-constants";
import { createClient } from "@/lib/supabase/server";

export { ACTIVE_AGENCY_KEY, resolveAgencyId, type UserAgency };

type MembershipRow = {
  agency_id: string;
  role: string;
  created_at: string;
  agencies: { name: string } | { name: string }[] | null;
};

function agencyNameFromRow(row: MembershipRow): string {
  const agencies = row.agencies;
  if (!agencies) return "Agency";
  if (Array.isArray(agencies)) return agencies[0]?.name ?? "Agency";
  return agencies.name ?? "Agency";
}

function mapMembershipRow(row: MembershipRow): UserAgency {
  return {
    agency_id: row.agency_id,
    name: agencyNameFromRow(row),
    role: row.role,
    created_at: row.created_at,
  };
}

/** All agencies the authenticated user belongs to (server). */
export async function getUserAgencies(): Promise<UserAgency[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("agency_members")
    .select("agency_id, role, created_at, agencies(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return (data as MembershipRow[]).map(mapMembershipRow);
}

/**
 * Resolves the current user's agency_id from membership, validated against
 * `care-route.activeAgencyId` cookie when set. Never trusts client-passed ids
 * without a membership check.
 */
export async function getCurrentAgencyId(): Promise<string | null> {
  const memberships = await getUserAgencies();
  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(ACTIVE_AGENCY_KEY)?.value ?? null;

  return resolveAgencyId(memberships, fromCookie);
}
