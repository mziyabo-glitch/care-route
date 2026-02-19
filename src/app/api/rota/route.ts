import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import { estimateTravel, estimateTravelFromPostcodes } from "@/lib/geo";

type VisitRow = {
  id: string;
  client_id: string;
  client_lat?: number | null;
  client_lng?: number | null;
  client_postcode?: string | null;
  carer_id: string;
  carer_ids?: string[];
  start_time: string;
  end_time: string;
  [key: string]: unknown;
};

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

  const visitList: VisitRow[] = Array.isArray(visits) ? visits : [];

  // Build unique client pairs from consecutive visits per carer/day
  const pairKeys = new Set<string>();
  const pairData: Record<string, { fromId: string; toId: string }> = {};

  const byCarerDay: Record<string, VisitRow[]> = {};
  for (const v of visitList) {
    const ids =
      Array.isArray(v.carer_ids) && v.carer_ids.length > 0
        ? v.carer_ids
        : v.carer_id
          ? [v.carer_id]
          : [];
    const dayKey = v.start_time.slice(0, 10);
    for (const cid of ids) {
      const key = `${cid}|${dayKey}`;
      if (!byCarerDay[key]) byCarerDay[key] = [];
      byCarerDay[key].push(v);
    }
  }

  for (const key of Object.keys(byCarerDay)) {
    const sorted = byCarerDay[key].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    for (let i = 1; i < sorted.length; i++) {
      const from = sorted[i - 1];
      const to = sorted[i];
      if (from.client_id && to.client_id && from.client_id !== to.client_id) {
        const pk = `${from.client_id}|${to.client_id}`;
        if (!pairKeys.has(pk)) {
          pairKeys.add(pk);
          pairData[pk] = { fromId: from.client_id, toId: to.client_id };
        }
      }
    }
  }

  // Lookup existing cache
  const travelTimes: Record<string, number> = {};
  const missingPairs: Array<{ key: string; fromId: string; toId: string }> = [];

  if (pairKeys.size > 0) {
    const fromIds = [...new Set(Object.values(pairData).map((p) => p.fromId))];
    const toIds = [...new Set(Object.values(pairData).map((p) => p.toId))];

    const { data: cached } = await supabase
      .from("travel_cache")
      .select("from_client_id, to_client_id, travel_minutes")
      .eq("agency_id", agencyId)
      .in("from_client_id", fromIds)
      .in("to_client_id", toIds);

    const cacheMap = new Set<string>();
    if (cached) {
      for (const row of cached) {
        const pk = `${row.from_client_id}|${row.to_client_id}`;
        if (pairKeys.has(pk)) {
          travelTimes[pk] = row.travel_minutes;
          cacheMap.add(pk);
        }
      }
    }

    for (const pk of pairKeys) {
      if (!cacheMap.has(pk)) {
        missingPairs.push({ key: pk, ...pairData[pk] });
      }
    }
  }

  // Compute missing pairs via Haversine, cache results
  if (missingPairs.length > 0) {
    const clientLatLng: Record<string, { lat: number | null; lng: number | null; postcode: string | null }> = {};
    for (const v of visitList) {
      if (v.client_id && !clientLatLng[v.client_id]) {
        clientLatLng[v.client_id] = {
          lat: v.client_lat ?? null,
          lng: v.client_lng ?? null,
          postcode: v.client_postcode ?? null,
        };
      }
    }

    const upsertPromises: Promise<unknown>[] = [];
    for (const pair of missingPairs) {
      const a = clientLatLng[pair.fromId];
      const b = clientLatLng[pair.toId];
      const geo = estimateTravel(a?.lat, a?.lng, b?.lat, b?.lng);

      if (geo) {
        travelTimes[pair.key] = geo.minutes;
        upsertPromises.push(
          supabase.rpc("upsert_travel_cache", {
            p_agency_id: agencyId,
            p_from_client_id: pair.fromId,
            p_to_client_id: pair.toId,
            p_distance_km: geo.distanceKm,
            p_travel_minutes: geo.minutes,
          })
        );
      } else {
        travelTimes[pair.key] = estimateTravelFromPostcodes(
          a?.postcode,
          b?.postcode
        );
      }
    }

    // Fire cache writes without blocking response
    if (upsertPromises.length > 0) {
      Promise.all(upsertPromises).catch(() => {});
    }
  }

  return NextResponse.json({
    carers: Array.isArray(carers) ? carers : [],
    visits: visitList,
    travelTimes,
  });
}
