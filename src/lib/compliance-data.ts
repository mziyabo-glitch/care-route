import type { SupabaseClient } from "@supabase/supabase-js";
import {
  carerNamesFromAssignments,
  dayRangeUtc,
  todayInLondon,
} from "@/lib/visit-map";

export type ComplianceMissedVisit = {
  id: string;
  client_id: string;
  client_name: string;
  carer_names: string[];
  start_time: string;
  end_time: string;
};

export type ComplianceMissingNote = {
  id: string;
  client_id: string;
  client_name: string;
  start_time: string;
  end_time: string;
  status: string;
  check_out_at: string | null;
};

type WeekVisit = {
  id: string;
  client_id: string;
  client_name?: string | null;
  status?: string;
  start_time: string;
  end_time: string;
  assignments?: unknown;
};

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

/** UTC window [start date, end date] inclusive (calendar days). */
export function complianceRangeUtc(
  start: string,
  end: string
): { start: string; end: string } {
  const { start: rangeStart } = dayRangeUtc(start);
  const { end: rangeEnd } = dayRangeUtc(end);
  return { start: rangeStart, end: rangeEnd };
}

/** Default range: last 7 calendar days ending today (Europe/London). */
export function defaultComplianceDateRange(): { start: string; end: string } {
  const end = todayInLondon();
  const d = new Date(`${end}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 6);
  return { start: d.toISOString().slice(0, 10), end };
}

/**
 * Agency-scoped compliance issues for a date range. Caller must pass an
 * authenticated Supabase client; RPC enforces agency membership.
 */
export async function getComplianceIssues(
  supabase: SupabaseClient,
  agencyId: string,
  start: string,
  end: string
): Promise<{
  missed_visits: ComplianceMissedVisit[];
  missing_notes: ComplianceMissingNote[];
}> {
  const { start: pStart, end: pEnd } = complianceRangeUtc(start, end);

  const { data: visitsRaw, error: visitsError } = await supabase.rpc(
    "list_visits_for_week",
    {
      p_agency_id: agencyId,
      p_week_start: pStart,
      p_week_end: pEnd,
    }
  );

  if (visitsError) {
    throw new Error(visitsError.message);
  }

  const visitList: WeekVisit[] = Array.isArray(visitsRaw) ? visitsRaw : [];
  const visitIds = visitList.map((v) => v.id);

  const actualsByVisit: Record<string, { check_out_at: string | null }> = {};
  const visitsWithNotes = new Set<string>();

  if (visitIds.length > 0) {
    const [actualsRes, notesRes] = await Promise.all([
      supabase
        .from("visit_actuals")
        .select("visit_id, check_out_at")
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
      actualsByVisit[row.visit_id] = { check_out_at: row.check_out_at };
    }
    for (const row of notesRes.data ?? []) {
      visitsWithNotes.add(row.visit_id);
    }
  }

  const missed_visits: ComplianceMissedVisit[] = [];
  const missing_notes: ComplianceMissingNote[] = [];

  for (const v of visitList) {
    const status = v.status ?? "scheduled";
    const actual = actualsByVisit[v.id];
    const checkOut = actual?.check_out_at ?? null;

    if (status === "missed") {
      missed_visits.push({
        id: v.id,
        client_id: v.client_id,
        client_name: v.client_name ?? "Unknown client",
        carer_names: carerNamesFromAssignments(v.assignments),
        start_time: v.start_time,
        end_time: v.end_time,
      });
    }

    if (isMissingCareNote(status, checkOut, visitsWithNotes.has(v.id))) {
      missing_notes.push({
        id: v.id,
        client_id: v.client_id,
        client_name: v.client_name ?? "Unknown client",
        start_time: v.start_time,
        end_time: v.end_time,
        status,
        check_out_at: checkOut,
      });
    }
  }

  const byStartDesc = (a: { start_time: string }, b: { start_time: string }) =>
    new Date(b.start_time).getTime() - new Date(a.start_time).getTime();

  missed_visits.sort(byStartDesc);
  missing_notes.sort(byStartDesc);

  return { missed_visits, missing_notes };
}
