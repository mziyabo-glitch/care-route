import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/permissions";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Only admins can approve timesheets" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_timesheet", { p_timesheet_id: id });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
