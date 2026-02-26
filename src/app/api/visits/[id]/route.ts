import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";

const STATUSES = ["scheduled", "in_progress", "completed", "missed"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const status = (body.status as string)?.trim();
  const clientId = (body.client_id as string)?.trim();
  const primaryCarerId = (body.carer_id as string)?.trim() || (body.primary_carer_id as string)?.trim();
  const secondaryCarerId = (body.secondary_carer_id as string)?.trim() || null;
  const startTime = (body.start_time as string)?.trim();
  const endTime = (body.end_time as string)?.trim();
  const notes = (body.notes as string)?.trim();

  const supabase = await createClient();

  // Full update (edit visit): client_id, primary carer, start_time, end_time required
  if (clientId && primaryCarerId && startTime && endTime) {
    const reqStatus = (body.status as string)?.trim() || undefined;
    if (reqStatus && !STATUSES.includes(reqStatus as (typeof STATUSES)[number])) {
      return NextResponse.json(
        { error: "Status must be scheduled, in_progress, completed, or missed" },
        { status: 400 }
      );
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Invalid start or end time" },
        { status: 400 }
      );
    }
    if (end <= start) {
      return NextResponse.json(
        { error: "End time must be after start time" },
        { status: 400 }
      );
    }
    if (secondaryCarerId && secondaryCarerId === primaryCarerId) {
      return NextResponse.json(
        { error: "Secondary carer must be different from primary" },
        { status: 400 }
      );
    }
    const { error } = await supabase.rpc("update_visit", {
      p_visit_id: id,
      p_client_id: clientId,
      p_primary_carer_id: primaryCarerId,
      p_secondary_carer_id: secondaryCarerId || null,
      p_start_time: startTime,
      p_end_time: endTime,
      p_status: reqStatus || null,
      p_notes: notes !== undefined ? notes : null,
    });
    if (error) {
      const isConflict =
        error.message?.toLowerCase().includes("overlapping") ||
        error.message?.toLowerCase().includes("visit during this time");
      return NextResponse.json(
        { error: error.message },
        { status: isConflict ? 409 : 500 }
      );
    }
    supabase.rpc("calculate_visit_risk", { p_visit_id: id }).then(() => {}, () => {});
    return NextResponse.json({ success: true });
  }

  // Status-only update
  if (!status || !STATUSES.includes(status as (typeof STATUSES)[number])) {
    return NextResponse.json(
      { error: "Status must be scheduled, in_progress, completed, or missed" },
      { status: 400 }
    );
  }
  const { error } = await supabase.rpc("update_visit_status", {
    p_visit_id: id,
    p_status: status,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  supabase.rpc("calculate_visit_risk", { p_visit_id: id }).then(() => {}, () => {});
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_visit", { p_visit_id: id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
