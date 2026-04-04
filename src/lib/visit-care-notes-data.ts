import type { SupabaseClient } from "@supabase/supabase-js";

export type VisitCareNoteRow = {
  id: string;
  agency_id: string;
  visit_id: string;
  author_id: string | null;
  body: string;
  note_type: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Confirms the visit row exists under the resolved agency (never trust client agency_id).
 */
export async function verifyVisitBelongsToAgency(
  supabase: SupabaseClient,
  visitId: string,
  agencyId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("visits")
    .select("id")
    .eq("id", visitId)
    .eq("agency_id", agencyId)
    .maybeSingle();
  return !!data;
}
