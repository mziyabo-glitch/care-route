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
    return NextResponse.json({ error: "Only admins can export timesheets" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_timesheet_detail", { p_timesheet_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type TimesheetDetail = {
    id: string; period_start: string; period_end: string; status: string;
    lines: Array<{ carer_name: string; payroll_number: string | null; total_hours: number }>;
  };
  const detail = data as TimesheetDetail | null;
  if (!detail) return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  if (detail.status !== "approved" && detail.status !== "exported") {
    return NextResponse.json({ error: "Only approved timesheets can be exported" }, { status: 400 });
  }

  const lines = detail.lines ?? [];
  const csvRows = [
    "employee_id,carer_name,period_start,period_end,total_hours",
    ...lines.map((l) =>
      [
        `"${(l.payroll_number ?? "").replace(/"/g, '""')}"`,
        `"${(l.carer_name ?? "").replace(/"/g, '""')}"`,
        detail.period_start,
        detail.period_end,
        Number(l.total_hours).toFixed(2),
      ].join(",")
    ),
  ];

  return new Response(csvRows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="payroll-${detail.period_start}-${detail.period_end}.csv"`,
    },
  });
}
