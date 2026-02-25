import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/permissions";

type TimesheetRow = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  approved_at: string | null;
  exported_at: string | null;
};

type TimesheetLineRow = {
  timesheet_id: string;
  total_minutes: number | null;
};

async function listTimesheetsFallback(agencyId: string) {
  const supabase = await createClient();
  const { data: timesheets, error: timesheetsError } = await supabase
    .from("timesheets")
    .select("id, period_start, period_end, status, approved_at, exported_at")
    .eq("agency_id", agencyId)
    .order("period_start", { ascending: false });
  if (timesheetsError) throw timesheetsError;

  const typedTimesheets = (timesheets ?? []) as TimesheetRow[];
  if (typedTimesheets.length === 0) return [];

  const ids = typedTimesheets.map((t) => t.id);
  const { data: lines, error: linesError } = await supabase
    .from("timesheet_lines")
    .select("timesheet_id, total_minutes")
    .in("timesheet_id", ids);
  if (linesError) throw linesError;

  const aggregates = new Map<string, { line_count: number; total_minutes: number }>();
  for (const row of (lines ?? []) as TimesheetLineRow[]) {
    const current = aggregates.get(row.timesheet_id) ?? { line_count: 0, total_minutes: 0 };
    current.line_count += 1;
    current.total_minutes += row.total_minutes ?? 0;
    aggregates.set(row.timesheet_id, current);
  }

  return typedTimesheets.map((t) => {
    const totals = aggregates.get(t.id) ?? { line_count: 0, total_minutes: 0 };
    return { ...t, line_count: totals.line_count, total_minutes: totals.total_minutes };
  });
}

function errorJson(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) return errorJson("Unauthorized", 401);
  if (role !== "owner" && role !== "admin") return errorJson("Only admins can access payroll", 403);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_timesheets", { p_agency_id: agencyId });

  if (!error) {
    return NextResponse.json({ timesheets: Array.isArray(data) ? data : [] });
  }

  // RPC failed — try direct table fallback
  try {
    const fallbackRows = await listTimesheetsFallback(agencyId);
    return NextResponse.json({ timesheets: fallbackRows });
  } catch {
    // Both RPC and table query failed — return empty list so page doesn't crash
    return NextResponse.json({ timesheets: [] });
  }
}

export async function POST(request: Request) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) return errorJson("Unauthorized", 401);
  if (role !== "owner" && role !== "admin") return errorJson("Only admins can generate timesheets", 403);

  const body = await request.json();
  const periodStart = body.period_start;
  const periodEnd = body.period_end;
  if (!periodStart || !periodEnd) {
    return errorJson("period_start and period_end are required", 400);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_timesheet", {
    p_agency_id: agencyId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });

  if (error) {
    // Always return the real Supabase error so admin can diagnose
    return NextResponse.json(
      { error: `${error.message} [${error.code ?? "unknown"}]` },
      { status: 400 }
    );
  }
  return NextResponse.json(data);
}
