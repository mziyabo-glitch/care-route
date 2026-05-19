import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/permissions";
import {
  carerNamesFromAssignments,
  dayRangeUtc,
  parseVisitMapDateParam,
  resolveDisplayStatus,
  todayInLondon,
  type VisitMapRow,
} from "@/lib/visit-map";

type WeekVisit = {
  id: string;
  client_id: string;
  client_name?: string | null;
  client_lat?: number | null;
  client_lng?: number | null;
  status?: string;
  start_time: string;
  end_time: string;
  assignments?: unknown;
};

export async function GET(request: Request) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (role !== "owner" && role !== "admin" && role !== "manager") {
    return NextResponse.json(
      { error: "Visit map is for managers only" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  if (dateParam && !parseVisitMapDateParam(dateParam)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 }
    );
  }
  const date = parseVisitMapDateParam(dateParam) ?? todayInLondon();

  const { start, end } = dayRangeUtc(date);
  const supabase = await createClient();

  const { data: visitsRaw, error: visitsError } = await supabase.rpc(
    "list_visits_for_week",
    {
      p_agency_id: agencyId,
      p_week_start: start,
      p_week_end: end,
    }
  );

  if (visitsError) {
    return NextResponse.json({ error: visitsError.message }, { status: 500 });
  }

  const visitList: WeekVisit[] = Array.isArray(visitsRaw) ? visitsRaw : [];
  const visitIds = visitList.map((v) => v.id);

  const actualsByVisit: Record<
    string,
    { check_in_at: string | null; check_out_at: string | null }
  > = {};

  if (visitIds.length > 0) {
    const { data: actuals, error: actualsError } = await supabase
      .from("visit_actuals")
      .select("visit_id, check_in_at, check_out_at")
      .eq("agency_id", agencyId)
      .in("visit_id", visitIds);

    if (actualsError) {
      return NextResponse.json({ error: actualsError.message }, { status: 500 });
    }

    for (const row of actuals ?? []) {
      actualsByVisit[row.visit_id] = {
        check_in_at: row.check_in_at,
        check_out_at: row.check_out_at,
      };
    }
  }

  const now = new Date();
  const visits: VisitMapRow[] = visitList.map((v) => {
    const actual = actualsByVisit[v.id];
    const checkIn = actual?.check_in_at ?? null;
    const checkOut = actual?.check_out_at ?? null;
    const status = v.status ?? "scheduled";
    return {
      id: v.id,
      client_id: v.client_id,
      client_name: v.client_name ?? "Unknown client",
      client_lat: v.client_lat ?? null,
      client_lng: v.client_lng ?? null,
      status,
      display_status: resolveDisplayStatus(status, v.start_time, checkIn, now),
      start_time: v.start_time,
      end_time: v.end_time,
      carer_names: carerNamesFromAssignments(v.assignments),
      check_in_at: checkIn,
      check_out_at: checkOut,
    };
  });

  const mappable = visits.filter(
    (v) => v.client_lat != null && v.client_lng != null
  );

  return NextResponse.json({
    date,
    visits,
    mappableCount: mappable.length,
    skippedNoCoords: visits.length - mappable.length,
  });
}
