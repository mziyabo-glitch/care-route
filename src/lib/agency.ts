import { createClient } from "@/lib/supabase/server";

/**
 * Resolves the current user's agency_id from agency membership.
 * Never trust a client-passed agency_id — always use this server-side.
 *
 * **Multi-agency limitation:** uses the first `agency_members` row for the user
 * (`.limit(1)` with no ordering). Users in multiple agencies may see the wrong
 * tenant until agency switching is implemented. Same pattern in
 * `(dashboard)/layout.tsx` (inline `agency_members` query — no `getCurrentAgencyMembership` helper).
 * See `docs/checklists/production-stabilisation-audit.md` and `TODO.md` section A9.
 */
export async function getCurrentAgencyId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: membership } = await supabase
    .from("agency_members")
    .select("agency_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  return membership?.agency_id ?? null;
}
