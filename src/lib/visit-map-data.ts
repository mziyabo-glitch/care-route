import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineKm } from "@/lib/geo";
import {
  carerNamesFromAssignments,
  dayRangeUtc,
  resolveDisplayStatus,
  type VisitMapDisplayStatus,
} from "@/lib/visit-map";

/** Check-in farther than this from client geocode triggers distance_warning (km). */
export const DISTANCE_WARNING_KM = 0.5;

export type VisitMapRow = {
  id: string;
  client_id: string;
  client_name: string;
  address: string;
  client_lat: number | null;
  client_lng: number | null;
  status: string;
  display_status: VisitMapDisplayStatus;
  start_time: string;
  end_time: string;
  carer_names: string[];
  carer_ids: string[];
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  missing_care_note: boolean;
  distance_warning: boolean;
};

type WeekVisit = {
  id: string;
  client_id: string;
  client_name?: string | null;
  client_postcode?: string | null;
  client_lat?: number | null;
  client_lng?: number | null;
  carer_id?: string | null;
  carer_ids?: string[] | null;
  status?: string;
  start_time: string;
  end_time: string;
  assignments?: unknown;
};

function formatClientAddress(
  address: string | null | undefined,
  postcode: string | null | undefined,
  fallbackPostcode?: string | null
): string {
  const pc = postcode ?? fallbackPostcode;
  const parts = [address?.trim(), pc?.trim()].filter(Boolean);
  return parts.join(", ");
}

function visitMatchesCarer(v: WeekVisit, carerId: string): boolean {
  const ids = Array.isArray(v.carer_ids) ? v.carer_ids : [];
  if (ids.includes(carerId)) return true;
  if (v.carer_id === carerId) return true;
  if (!Array.isArray(v.assignments)) return false;
  for (const a of v.assignments) {
    if (a && typeof a === "object" && "carer_id" in a) {
      if ((a as { carer_id?: string }).carer_id === carerId) return true;
    }
  }
  return false;
}

function carerIdsFromVisit(v: WeekVisit): string[] {
  const fromAssignments = new Set<string>();
  if (Array.isArray(v.assignments)) {
    for (const a of v.assignments) {
      if (a && typeof a === "object" && "carer_id" in a) {
        const id = (a as { carer_id?: string }).carer_id;
        if (id) fromAssignments.add(id);
      }
    }
  }
  if (fromAssignments.size > 0) return [...fromAssignments];
  const ids = Array.isArray(v.carer_ids) ? v.carer_ids.filter(Boolean) : [];
  if (ids.length > 0) return ids;
  if (v.carer_id) return [v.carer_id];
  return [];
}

function isDistanceWarning(
  clientLat: number | null,
  clientLng: number | null,
  checkInLat: number | null | undefined,
  checkInLng: number | null | undefined
): boolean {
  if (
    clientLat == null ||
    clientLng == null ||
    checkInLat == null ||
    checkInLng == null
  ) {
    return false;
  }
  const km = haversineKm(clientLat, clientLng, checkInLat, checkInLng);
  return km > DISTANCE_WARNING_KM;
}

function isMissingCareNote(
  status: string,
  checkOutAt: string | null,
  hasNote: boolean
): boolean {
  if (hasNote) return false;
  if (status === "completed") return true;
  if (checkOutAt) return true;
  return false;
}

/**
 * Agency-scoped visits for a calendar date (UTC day window). Caller must pass
 * an authenticated Supabase client; RPC enforces agency membership.
 */
export async function getVisitMapRows(
  supabase: SupabaseClient,
  agencyId: string,
  date: string,
  carerId?: string | null
): Promise<VisitMapRow[]> {
  const { start, end } = dayRangeUtc(date);

  const { data: visitsRaw, error: visitsError } = await supabase.rpc(
    "list_visits_for_week",
    {
      p_agency_id: agencyId,
      p_week_start: start,
      p_week_end: end,
    }
  );

  if (visitsError) {
    throw new Error(visitsError.message);
  }

  let visitList: WeekVisit[] = Array.isArray(visitsRaw) ? visitsRaw : [];
  if (carerId) {
    visitList = visitList.filter((v) => visitMatchesCarer(v, carerId));
  }

  const visitIds = visitList.map((v) => v.id);
  const clientIds = [...new Set(visitList.map((v) => v.client_id))];

  const addressByClient: Record<string, { address: string; postcode: string | null }> =
    {};
  if (clientIds.length > 0) {
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, address, postcode")
      .eq("agency_id", agencyId)
      .in("id", clientIds);

    if (clientsError) {
      throw new Error(clientsError.message);
    }

    for (const c of clients ?? []) {
      addressByClient[c.id] = {
        address: c.address ?? "",
        postcode: c.postcode,
      };
    }
  }

  type ActualRow = {
    visit_id: string;
    check_in_at: string | null;
    check_out_at: string | null;
    check_in_latitude: number | null;
    check_in_longitude: number | null;
    check_out_latitude: number | null;
    check_out_longitude: number | null;
  };

  const actualsByVisit: Record<string, ActualRow> = {};
  const visitsWithNotes = new Set<string>();

  if (visitIds.length > 0) {
    const [actualsRes, notesRes] = await Promise.all([
      supabase
        .from("visit_actuals")
        .select(
          "visit_id, check_in_at, check_out_at, check_in_latitude, check_in_longitude, check_out_latitude, check_out_longitude"
        )
        .eq("agency_id", agencyId)
        .in("visit_id", visitIds),
      supabase
        .from("visit_care_notes")
        .select("visit_id")
        .eq("agency_id", agencyId)
        .in("visit_id", visitIds),
    ]);

    if (actualsRes.error) {
      throw new Error(actualsRes.error.message);
    }
    if (notesRes.error) {
      throw new Error(notesRes.error.message);
    }

    for (const row of actualsRes.data ?? []) {
      actualsByVisit[row.visit_id] = row;
    }
    for (const row of notesRes.data ?? []) {
      visitsWithNotes.add(row.visit_id);
    }
  }

  const now = new Date();
  return visitList.map((v) => {
    const actual = actualsByVisit[v.id];
    const checkIn = actual?.check_in_at ?? null;
    const checkOut = actual?.check_out_at ?? null;
    const status = v.status ?? "scheduled";
    const clientLat = v.client_lat ?? null;
    const clientLng = v.client_lng ?? null;
    const addr = addressByClient[v.client_id];
    const address = formatClientAddress(
      addr?.address,
      addr?.postcode,
      v.client_postcode
    );

    return {
      id: v.id,
      client_id: v.client_id,
      client_name: v.client_name ?? "Unknown client",
      address,
      client_lat: clientLat,
      client_lng: clientLng,
      status,
      display_status: resolveDisplayStatus(status, v.start_time, checkIn, now),
      start_time: v.start_time,
      end_time: v.end_time,
      carer_names: carerNamesFromAssignments(v.assignments),
      carer_ids: carerIdsFromVisit(v),
      check_in_at: checkIn,
      check_out_at: checkOut,
      check_in_latitude: actual?.check_in_latitude ?? null,
      check_in_longitude: actual?.check_in_longitude ?? null,
      check_out_latitude: actual?.check_out_latitude ?? null,
      check_out_longitude: actual?.check_out_longitude ?? null,
      missing_care_note: isMissingCareNote(
        status,
        checkOut,
        visitsWithNotes.has(v.id)
      ),
      distance_warning: isDistanceWarning(
        clientLat,
        clientLng,
        actual?.check_in_latitude,
        actual?.check_in_longitude
      ),
    };
  });
}
