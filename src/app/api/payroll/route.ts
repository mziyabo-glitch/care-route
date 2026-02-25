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

function isListTimesheetsRpcMissing(error: { message: string; code?: string | null }) {
  const message = error.message.toLowerCase();
  return (
    (error.code ?? "").startsWith("PGRST") ||
    message.includes("could not find the function") ||
    message.includes("schema cache")
  );
}

function isSchemaDriftError(error: { message: string; code?: string | null }) {
  const code = error.code ?? "";
  const message = error.message.toLowerCase();
  return (
    code === "42P01" || // undefined_table
    code === "42703" || // undefined_column
    code.startsWith("PGRST") ||
    message.includes("schema cache") ||
    message.includes("could not find the function") ||
    message.includes("relation") && message.includes("does not exist") ||
    message.includes("column") && message.includes("does not exist")
  );
}

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
    return {
      ...t,
      line_count: totals.line_count,
      total_minutes: totals.total_minutes,
    };
  });
}

function rpcErrorResponse(error: { message: string; code?: string | null }) {
  const isDev = process.env.NODE_ENV !== "production";
  const isClientError =
    isListTimesheetsRpcMissing(error);
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
  if (error) {
    try {
      const fallbackRows = await listTimesheetsFallback(agencyId);
      return NextResponse.json({ timesheets: fallbackRows });
    } catch (fallbackError) {
      const message =
        fallbackError && typeof fallbackError === "object" && "message" in fallbackError
          ? String((fallbackError as { message?: unknown }).message ?? "")
          : "Failed to load payroll data";
      const code =
        fallbackError && typeof fallbackError === "object" && "code" in fallbackError
          ? String((fallbackError as { code?: unknown }).code ?? "")
          : null;
      if (isSchemaDriftError({ message, code })) {
        return NextResponse.json({ timesheets: [] });
      }
      if (isListTimesheetsRpcMissing(error)) {
        return rpcErrorResponse({ message, code });
      }
      return rpcErrorResponse(error);
    }
  }
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

  if (error) {
    if (isSchemaDriftError(error)) {
      return NextResponse.json(
        { error: "Payroll tables are not set up yet. Please run the bootstrap SQL in Supabase SQL Editor." },
        { status: 400 }
      );
    }
    return rpcErrorResponse(error);
  }
  return NextResponse.json(data);
}
