import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/permissions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "owner" && role !== "admin" && role !== "manager") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const reason = (body.reason as string)?.trim();
  if (!reason) return NextResponse.json({ error: "Reason is required" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_adjust_visit_time", {
    p_visit_id: id,
    p_new_check_in: body.check_in_at ?? null,
    p_new_check_out: body.check_out_at ?? null,
    p_new_break: body.break_minutes ?? null,
    p_reason: reason,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_visit_adjustments", { p_visit_id: id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ adjustments: Array.isArray(data) ? data : [] });
}
