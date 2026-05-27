import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import { deriveVisitAuditFlags } from "@/lib/visit-audit";
import { verifyVisitBelongsToAgency } from "@/lib/visit-care-notes-data";

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

  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .select(
      "id, client_id, status, start_time, end_time, notes, requires_double_up"
    )
    .eq("id", visitId)
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (visitError || !visit) {
    return NextResponse.json(
      { error: visitError?.message ?? "Visit not found" },
      { status: 404 }
    );
  }

  const clientId = visit.client_id as string;

  const [
    clientRes,
    actualRes,
    notesRes,
    assignmentsRes,
    carePlanRes,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("latitude, longitude, requires_double_up")
      .eq("id", clientId)
      .eq("agency_id", agencyId)
      .maybeSingle(),
    supabase
      .from("visit_actuals")
      .select(
        "check_in_at, check_out_at, break_minutes, check_in_latitude, check_in_longitude"
      )
      .eq("visit_id", visitId)
      .eq("agency_id", agencyId)
      .maybeSingle(),
    supabase
      .from("visit_care_notes")
      .select("id", { count: "exact", head: true })
      .eq("visit_id", visitId)
      .eq("agency_id", agencyId),
    supabase
      .from("visit_assignments")
      .select("carer_id")
      .eq("visit_id", visitId),
    supabase
      .from("care_plans")
      .select("id")
      .eq("client_id", clientId)
      .eq("agency_id", agencyId)
      .eq("status", "active")
      .limit(1),
  ]);

  const assignmentCount = assignmentsRes.data?.length ?? 0;
  const requiresDoubleUp =
    (visit.requires_double_up as boolean | null) ??
    (clientRes.data?.requires_double_up as boolean | null) ??
    false;

  const actual = actualRes.data;
  const flags = deriveVisitAuditFlags({
    status: visit.status as string,
    start_time: visit.start_time as string,
    end_time: visit.end_time as string,
    check_in_at: actual?.check_in_at ?? null,
    check_out_at: actual?.check_out_at ?? null,
    break_minutes: actual?.break_minutes ?? null,
    client_lat: clientRes.data?.latitude ?? null,
    client_lng: clientRes.data?.longitude ?? null,
    check_in_latitude: actual?.check_in_latitude ?? null,
    check_in_longitude: actual?.check_in_longitude ?? null,
    has_care_note: (notesRes.count ?? 0) > 0,
    requires_double_up: requiresDoubleUp,
    missing_second_carer: requiresDoubleUp && assignmentCount < 2,
    has_active_care_plan: (carePlanRes.data?.length ?? 0) > 0,
  });

  return NextResponse.json({
    visit_id: visitId,
    client_id: clientId,
    scheduled: {
      start_time: visit.start_time,
      end_time: visit.end_time,
      duration_minutes: flags.scheduledDurationMinutes,
    },
    actual: {
      check_in_at: actual?.check_in_at ?? null,
      check_out_at: actual?.check_out_at ?? null,
      break_minutes: actual?.break_minutes ?? null,
      duration_minutes: flags.durationMinutes,
    },
    flags: {
      carePlanPresent: flags.carePlanPresent,
      missingNotes: flags.missingNotes,
      lateVisit: flags.lateVisit,
      gpsMismatch: flags.gpsMismatch,
      missedVisit: flags.missedVisit,
      doubleUpGap: flags.doubleUpGap,
    },
  });
}
