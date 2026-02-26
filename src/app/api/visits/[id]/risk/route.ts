import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import { getCurrentRole } from "@/lib/permissions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  // Try get first; if null, calculate
  const { data: existing } = await supabase.rpc("get_visit_risk", { p_visit_id: id });
  if (existing && existing.risk_score !== undefined) {
    return NextResponse.json(existing);
  }

  const { data: calculated, error } = await supabase.rpc("calculate_visit_risk", {
    p_visit_id: id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(calculated);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin", "manager"].includes(role)) {
    return NextResponse.json({ error: "Only admins and managers can recalculate risk" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("calculate_visit_risk", {
    p_visit_id: id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
