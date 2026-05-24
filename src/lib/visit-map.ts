/** Manager+ visit map display helpers (static daily pins, no live tracking). */

export type VisitMapDisplayStatus =
  | "scheduled"
  | "due_soon"
  | "late"
  | "in_progress"
  | "completed"
  | "missed";

/** Minutes before scheduled start when a visit is "due soon". */
export const DUE_SOON_MINUTES = 30;

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
 * Derived pin status for the visit map.
 * - due_soon: scheduled, start within DUE_SOON_MINUTES, no check-in
 * - late: scheduled, start passed, no check-in
 */
export function resolveDisplayStatus(
  status: string,
  startTime: string,
  checkInAt: string | null,
  now: Date = new Date()
): VisitMapDisplayStatus {
  if (status === "scheduled") {
    const startMs = new Date(startTime).getTime();
    const nowMs = now.getTime();
    if (startMs <= nowMs && !checkInAt) return "late";
    if (
      !checkInAt &&
      startMs > nowMs &&
      startMs - nowMs <= DUE_SOON_MINUTES * 60 * 1000
    ) {
      return "due_soon";
    }
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
  due_soon: "#0891B2",
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

export function displayStatusLabel(status: VisitMapDisplayStatus): string {
  return status.replace(/_/g, " ");
}

export function carerNamesFromAssignments(assignments: unknown): string[] {
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

export type { VisitMapRow } from "@/lib/visit-map-data";
