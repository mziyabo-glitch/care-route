import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/permissions";

function rpcErrorResponse(error: { message: string; code?: string | null }) {
  const isDev = process.env.NODE_ENV !== "production";
  const isClientError =
    (error.code ?? "").startsWith("PGRST") ||
    error.message.toLowerCase().includes("could not find the function");
  const status = isClientError ? 400 : 500;
  const fallbackMessage = status === 400 ? "Invalid payroll request" : "Failed to load payroll data";
  return NextResponse.json(
    { error: isDev ? error.message : fallbackMessage },
    { status }
  );
}

export async function GET() {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Only admins can access payroll" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_timesheets", { p_agency_id: agencyId });
  if (error) return rpcErrorResponse(error);
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

  if (error) return rpcErrorResponse(error);
  return NextResponse.json(data);
}
