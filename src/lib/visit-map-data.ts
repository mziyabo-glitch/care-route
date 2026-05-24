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
  client_address?: string | null;
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
  postcode: string | null | undefined
): string {
  const parts = [address?.trim(), postcode?.trim()].filter(Boolean);
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

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeWeekVisit(raw: unknown): WeekVisit | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.client_id !== "string") return null;
  if (typeof v.start_time !== "string" || typeof v.end_time !== "string") {
    return null;
  }
  return {
    id: v.id,
    client_id: v.client_id,
    client_name:
      typeof v.client_name === "string" ? v.client_name : undefined,
    client_address:
      typeof v.client_address === "string" ? v.client_address : undefined,
    client_postcode:
      typeof v.client_postcode === "string" ? v.client_postcode : undefined,
    client_lat: asNumber(v.client_lat),
    client_lng: asNumber(v.client_lng),
    carer_id: typeof v.carer_id === "string" ? v.carer_id : undefined,
    carer_ids: Array.isArray(v.carer_ids)
      ? v.carer_ids.filter((id): id is string => typeof id === "string")
      : undefined,
    status: typeof v.status === "string" ? v.status : undefined,
    start_time: v.start_time,
    end_time: v.end_time,
    assignments: v.assignments,
  };
}

function mapVisitRow(
  v: WeekVisit,
  actual: {
    check_in_at: string | null;
    check_out_at: string | null;
    check_in_latitude: number | null;
    check_in_longitude: number | null;
    check_out_latitude: number | null;
    check_out_longitude: number | null;
  } | undefined,
  hasNote: boolean,
  now: Date
): VisitMapRow {
  const checkIn = actual?.check_in_at ?? null;
  const checkOut = actual?.check_out_at ?? null;
  const status = v.status ?? "scheduled";
  const clientLat = v.client_lat ?? null;
  const clientLng = v.client_lng ?? null;

  return {
    id: v.id,
    client_id: v.client_id,
    client_name: v.client_name ?? "Unknown client",
    address: formatClientAddress(v.client_address, v.client_postcode),
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
    missing_care_note: isMissingCareNote(status, checkOut, hasNote),
    distance_warning: isDistanceWarning(
      clientLat,
      clientLng,
      actual?.check_in_latitude,
      actual?.check_in_longitude
    ),
  };
}

export type VisitMapQueryDebug = {
  date: string;
  agencyId: string;
  carerId: string | null;
  visitCount: number;
  geocodedCount: number;
  firstError: string | null;
};

/**
 * Agency-scoped visits for a calendar date (UTC day window). Caller must pass
 * an authenticated Supabase client; RPC enforces agency membership.
 *
 * Avoids direct reads on `clients` — production RLS on that table recurses
 * (clients ↔ visits) and raises "stack depth limit exceeded".
 */
export async function getVisitMapRows(
  supabase: SupabaseClient,
  agencyId: string,
  date: string,
  carerId?: string | null,
  debug?: VisitMapQueryDebug
): Promise<VisitMapRow[]> {
  const { start, end } = dayRangeUtc(date);
  let firstError: string | null = null;
  const noteError = (label: string, message: string) => {
    if (!firstError) firstError = `${label}: ${message}`;
  };

  const { data: visitsRaw, error: visitsError } = await supabase.rpc(
    "list_visits_for_week",
    {
      p_agency_id: agencyId,
      p_week_start: start,
      p_week_end: end,
    }
  );

  if (visitsError) {
    noteError("list_visits_for_week", visitsError.message);
    throw new Error(visitsError.message);
  }

  const rawList = Array.isArray(visitsRaw) ? visitsRaw : [];
  let visitList: WeekVisit[] = [];
  for (const raw of rawList) {
    const normalized = normalizeWeekVisit(raw);
    if (normalized) visitList.push(normalized);
  }

  if (carerId) {
    visitList = visitList.filter((v) => visitMatchesCarer(v, carerId));
  }

  const visitIds = visitList.map((v) => v.id);

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
      noteError("visit_actuals", actualsRes.error.message);
      throw new Error(actualsRes.error.message);
    }
    if (notesRes.error) {
      noteError("visit_care_notes", notesRes.error.message);
      throw new Error(notesRes.error.message);
    }

    for (const row of actualsRes.data ?? []) {
      if (typeof row.visit_id === "string") {
        actualsByVisit[row.visit_id] = row;
      }
    }
    for (const row of notesRes.data ?? []) {
      if (typeof row.visit_id === "string") {
        visitsWithNotes.add(row.visit_id);
      }
    }
  }

  const now = new Date();
  const rows: VisitMapRow[] = [];
  for (const v of visitList) {
    try {
      rows.push(
        mapVisitRow(v, actualsByVisit[v.id], visitsWithNotes.has(v.id), now)
      );
    } catch {
      // Skip malformed visit rows rather than failing the whole page.
    }
  }

  if (debug) {
    debug.date = date;
    debug.agencyId = agencyId;
    debug.carerId = carerId ?? null;
    debug.visitCount = rows.length;
    debug.geocodedCount = rows.filter(
      (r) => r.client_lat != null && r.client_lng != null
    ).length;
    debug.firstError = firstError;
  }

  return rows;
}
