import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import {
  verifyVisitBelongsToAgency,
  type VisitCareNoteRow,
} from "@/lib/visit-care-notes-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: visitId } = await params;
  const supabase = await createClient();

  const ok = await verifyVisitBelongsToAgency(supabase, visitId, agencyId);
  if (!ok) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("visit_care_notes")
    .select("*")
    .eq("visit_id", visitId)
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    notes: (data ?? []) as VisitCareNoteRow[],
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: visitId } = await params;
  const supabase = await createClient();

  const ok = await verifyVisitBelongsToAgency(supabase, visitId, agencyId);
  if (!ok) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text =
    typeof body.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const note_type =
    body.note_type === null || body.note_type === undefined
      ? null
      : typeof body.note_type === "string" && body.note_type.trim()
        ? body.note_type.trim()
        : null;

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("visit_care_notes")
    .insert({
      agency_id: agencyId,
      visit_id: visitId,
      author_id: user.id,
      body: text,
      note_type,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ note: data as VisitCareNoteRow });
}
