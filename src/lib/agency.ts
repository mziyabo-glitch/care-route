import { createClient } from "@/lib/supabase/server";

/**
 * Resolves the current user's agency_id from agency membership.
 * Never trust a client-passed agency_id — always use this server-side.
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
