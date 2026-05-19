import { createClient } from "@/lib/supabase/server";

export type AgencyMembership = {
  agency_id: string;
  role: string;
};

/**
 * Resolves the current user's agency membership (agency_id + role).
 *
 * Uses the first matching `agency_members` row (`limit(1)` with no `ORDER BY`).
 * If the user belongs to multiple agencies, which row is returned is
 * database-defined and may not match the agency they intend — MVP assumes
 * one agency per user.
 *
 * Never trust a client-passed `agency_id` — always use this server-side.
 */
export async function getCurrentAgencyMembership(): Promise<AgencyMembership | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: membership } = await supabase
    .from("agency_members")
    .select("agency_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.agency_id) return null;

  return {
    agency_id: membership.agency_id,
    role: membership.role,
  };
}

/**
 * Resolves the current user's `agency_id` from agency membership.
 *
 * @see getCurrentAgencyMembership — same `limit(1)` semantics; use that
 * helper when you also need `role` without a second query.
 */
export async function getCurrentAgencyId(): Promise<string | null> {
  const membership = await getCurrentAgencyMembership();
  return membership?.agency_id ?? null;
}
