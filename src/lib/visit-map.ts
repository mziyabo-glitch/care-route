/** Manager+ visit map helpers (static daily pins, no live tracking). */

export type VisitMapDisplayStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "missed"
  | "late";

export type VisitMapAssignment = {
  carer_id: string;
  carer_name: string | null;
  role: string;
};

export type VisitMapRow = {
  id: string;
  client_id: string;
  client_name: string;
  client_lat: number | null;
  client_lng: number | null;
  status: string;
  display_status: VisitMapDisplayStatus;
  start_time: string;
  end_time: string;
  carer_names: string[];
  check_in_at: string | null;
  check_out_at: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar date in Europe/London as YYYY-MM-DD. */
export function todayInLondon(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

export function parseVisitMapDateParam(date: string | null): string | null {
  if (!date) return null;
  if (!DATE_RE.test(date)) return null;
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return date;
}

/** UTC midnight-to-midnight window for the given calendar date (documented in VISIT_MAP.md). */
export function dayRangeUtc(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Late: visit is still `scheduled`, scheduled start is in the past, and no check-in recorded.
 * See docs/VISIT_MAP.md.
 */
export function resolveDisplayStatus(
  status: string,
  startTime: string,
  checkInAt: string | null,
  now: Date = new Date()
): VisitMapDisplayStatus {
  if (status === "scheduled") {
    const started = new Date(startTime).getTime() <= now.getTime();
    if (started && !checkInAt) return "late";
    return "scheduled";
  }
  if (
    status === "in_progress" ||
    status === "completed" ||
    status === "missed"
  ) {
    return status;
  }
  return "scheduled";
}

export const PIN_COLORS: Record<VisitMapDisplayStatus, string> = {
  scheduled: "#2563EB",
  late: "#F59E0B",
  in_progress: "#7C3AED",
  completed: "#16A34A",
  missed: "#DC2626",
};

export function pinColor(status: VisitMapDisplayStatus): string {
  return PIN_COLORS[status] ?? PIN_COLORS.scheduled;
}

export function formatUkTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function carerNamesFromAssignments(
  assignments: unknown
): string[] {
  if (!Array.isArray(assignments)) return [];
  const names: string[] = [];
  for (const a of assignments) {
    if (a && typeof a === "object" && "carer_name" in a) {
      const n = (a as { carer_name?: string | null }).carer_name;
      if (n) names.push(n);
    }
  }
  return names;
}
