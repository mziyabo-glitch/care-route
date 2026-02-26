import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/permissions";

export async function POST(request: Request) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin", "manager"].includes(role)) {
    return NextResponse.json({ error: "Only admins and managers can recalculate risk" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("weekStart");
  const weekEnd = searchParams.get("weekEnd");
  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: "weekStart and weekEnd required (ISO timestamps)" }, { status: 400 });
  }

  const fromDate = weekStart.slice(0, 10);
  const toDate = weekEnd.slice(0, 10);

  const supabase = await createClient();
  const { data: count, error } = await supabase.rpc("recalculate_visit_risk_for_range", {
    p_agency_id: agencyId,
    p_from: fromDate,
    p_to: toDate,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: count ?? 0 });
}
