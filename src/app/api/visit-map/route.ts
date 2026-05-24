import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

import { canAccessVisitMap, getCurrentRole } from "@/lib/permissions";

import {
  getVisitMapRows,
  type VisitMapQueryDebug,
} from "@/lib/visit-map-data";

import { parseVisitMapDateParam, todayInLondon } from "@/lib/visit-map";

export async function GET(request: Request) {
  const { agencyId, role } = await getCurrentRole();

  if (!agencyId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessVisitMap(role)) {
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
  const carerId = searchParams.get("carer_id")?.trim() || null;

  const supabase = await createClient();
  const debug: VisitMapQueryDebug = {
    date,
    agencyId,
    carerId,
    visitCount: 0,
    geocodedCount: 0,
    firstError: null,
  };

  try {
    const [visits, carersRes] = await Promise.all([
      getVisitMapRows(supabase, agencyId, date, carerId, debug),
      supabase.rpc("list_carers_for_selection", { p_agency_id: agencyId }),
    ]);

    if (carersRes.error) {
      if (process.env.NODE_ENV === "development") {
        console.debug("[visit-map] list_carers_for_selection error", {
          ...debug,
          error: carersRes.error.message,
        });
      }
      return NextResponse.json(
        { error: carersRes.error.message },
        { status: 500 }
      );
    }

    const mappable = visits.filter(
      (v) => v.client_lat != null && v.client_lng != null
    );

    if (process.env.NODE_ENV === "development") {
      console.debug("[visit-map]", debug);
    }

    return NextResponse.json({
      date,
      visits,
      carers: Array.isArray(carersRes.data) ? carersRes.data : [],
      mappableCount: mappable.length,
      skippedNoCoords: visits.length - mappable.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load visits";
    if (process.env.NODE_ENV === "development") {
      console.debug("[visit-map] error", { ...debug, error: message });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
