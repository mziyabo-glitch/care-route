import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves the current user's agency_id from agency membership.
 * Uses the membership with the newest `created_at` (DESC).
 * Never trust a client-passed agency_id — always use this server-side.
 */
export async function getCurrentAgencyId(): Promise<string | null> {
  const agency = await getCurrentAgency();
  return agency?.id ?? null;
}

/** Current agency id and display name (from `agencies.name`). */
export async function getCurrentAgency(): Promise<{
  id: string;
  name: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: membership } = await supabase
    .from("agency_members")
    .select("agency_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const agencyId = membership?.agency_id;
  if (!agencyId) return null;

  const name = await fetchAgencyName(supabase, agencyId);
  return { id: agencyId, name };
}

export async function fetchAgencyName(
  supabase: SupabaseClient,
  agencyId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("agencies")
    .select("name")
    .eq("id", agencyId)
    .maybeSingle();

  if (error || !data?.name?.trim()) {
    return "Unnamed agency";
  }
  return data.name.trim();
}
