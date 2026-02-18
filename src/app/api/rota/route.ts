import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";

export async function GET(request: Request) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("weekStart");
  const weekEnd = searchParams.get("weekEnd");

  if (!weekStart || !weekEnd) {
    return NextResponse.json(
      { error: "weekStart and weekEnd required (ISO timestamps)" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const [
    { data: carers },
    { data: visits, error: visitsError },
  ] = await Promise.all([
    supabase.rpc("list_carers_for_selection", { p_agency_id: agencyId }),
    supabase.rpc("list_visits_for_week", {
      p_agency_id: agencyId,
      p_week_start: weekStart,
      p_week_end: weekEnd,
    }),
  ]);

  if (visitsError) {
    return NextResponse.json(
      { error: visitsError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    carers: Array.isArray(carers) ? carers : [],
    visits: Array.isArray(visits) ? visits : [],
  });
}
