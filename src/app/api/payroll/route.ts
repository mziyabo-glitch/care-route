import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/permissions";

export async function GET() {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Only admins can access payroll" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_timesheets", { p_agency_id: agencyId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ timesheets: Array.isArray(data) ? data : [] });
}

export async function POST(request: Request) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Only admins can generate timesheets" }, { status: 403 });
  }

  const body = await request.json();
  const periodStart = body.period_start;
  const periodEnd = body.period_end;
  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: "period_start and period_end are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_timesheet", {
    p_agency_id: agencyId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
