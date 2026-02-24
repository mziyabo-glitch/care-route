import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/permissions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Only admins can view timesheet details" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_timesheet_detail", { p_timesheet_id: id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  return NextResponse.json(data);
}
