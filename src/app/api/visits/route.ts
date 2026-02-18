import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";

const STATUSES = ["scheduled", "completed", "missed"] as const;

export async function POST(request: Request) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const clientId = (body.client_id as string)?.trim();
  const primaryCarerId = (body.carer_id as string)?.trim() || (body.primary_carer_id as string)?.trim();
  const secondaryCarerId = (body.secondary_carer_id as string)?.trim() || null;
  const startTime = (body.start_time as string)?.trim();
  const endTime = (body.end_time as string)?.trim();
  const status = (body.status as string)?.trim() || "scheduled";
  const notes = (body.notes as string)?.trim() || null;

  if (!clientId || !primaryCarerId || !startTime || !endTime) {
    return NextResponse.json(
      { error: "Client, primary carer, start time, and end time are required" },
      { status: 400 }
    );
  }
  if (secondaryCarerId && secondaryCarerId === primaryCarerId) {
    return NextResponse.json(
      { error: "Secondary carer must be different from primary" },
      { status: 400 }
    );
  }

  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return NextResponse.json(
      { error: "Status must be scheduled, completed, or missed" },
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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("insert_visit", {
    p_agency_id: agencyId,
    p_client_id: clientId,
    p_primary_carer_id: primaryCarerId,
    p_secondary_carer_id: secondaryCarerId || null,
    p_start_time: startTime,
    p_end_time: endTime,
    p_status: status,
    p_notes: notes,
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

  return NextResponse.json(data);
}
