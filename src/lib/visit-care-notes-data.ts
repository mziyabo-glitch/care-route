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

export type VisitCareNoteWithAuthor = VisitCareNoteRow & {
  author_email: string | null;
  author_label: string;
};

type AgencyMemberJson = { user_id?: string; email?: string };

function authorLabel(authorId: string | null, emailByUserId: Map<string, string>): string {
  if (!authorId) return "Staff";
  const email = emailByUserId.get(authorId);
  if (email) return email;
  return authorId.length > 8 ? `${authorId.slice(0, 8)}…` : authorId;
}

/**
 * Resolves author display via agency_members + auth.users (list_agency_members RPC).
 */
export async function enrichVisitCareNotesWithAuthors(
  supabase: SupabaseClient,
  agencyId: string,
  notes: VisitCareNoteRow[]
): Promise<VisitCareNoteWithAuthor[]> {
  const emailByUserId = new Map<string, string>();
  const { data: membersRaw, error } = await supabase.rpc("list_agency_members", {
    p_agency_id: agencyId,
  });
  if (!error && Array.isArray(membersRaw)) {
    for (const row of membersRaw as AgencyMemberJson[]) {
      if (row?.user_id && row.email) {
        emailByUserId.set(String(row.user_id), String(row.email));
      }
    }
  }
  return notes.map((n) => {
    const author_email = n.author_id ? emailByUserId.get(n.author_id) ?? null : null;
    return {
      ...n,
      author_email,
      author_label: authorLabel(n.author_id, emailByUserId),
    };
  });
}

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
