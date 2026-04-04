import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import type { VisitCareNoteRow } from "@/lib/visit-care-notes-data";

async function loadNoteForAgency(
  supabase: SupabaseClient,
  noteId: string,
  agencyId: string
): Promise<VisitCareNoteRow | null> {
  const { data, error } = await supabase
    .from("visit_care_notes")
    .select("*")
    .eq("id", noteId)
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (error || !data) return null;
  return data as VisitCareNoteRow;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: noteId } = await params;
  const supabase = await createClient();

  const existing = await loadNoteForAgency(supabase, noteId, agencyId);
  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hasBody = "body" in body;
  const hasNoteType = "note_type" in body;
  if (!hasBody && !hasNoteType) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (hasBody) {
    if (typeof body.body !== "string" || !body.body.trim()) {
      return NextResponse.json({ error: "body must be non-empty text" }, { status: 400 });
    }
    updates.body = (body.body as string).trim();
  }
  if (hasNoteType) {
    updates.note_type =
      body.note_type === null || body.note_type === ""
        ? null
        : typeof body.note_type === "string"
          ? body.note_type.trim() || null
          : null;
  }

  const { data, error } = await supabase
    .from("visit_care_notes")
    .update(updates)
    .eq("id", noteId)
    .eq("agency_id", agencyId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ note: data as VisitCareNoteRow });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: noteId } = await params;
  const supabase = await createClient();

  const existing = await loadNoteForAgency(supabase, noteId, agencyId);
  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("visit_care_notes")
    .delete()
    .eq("id", noteId)
    .eq("agency_id", agencyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
