import { haversineKm } from "@/lib/geo";
import { resolveDisplayStatus } from "@/lib/visit-map";
import { DISTANCE_WARNING_KM } from "@/lib/visit-map-data";

/** Minutes after scheduled start before check-in counts as late. */
export const VISIT_LATE_CHECKIN_TOLERANCE_MINUTES = 15;

export type VisitAuditInput = {
  status: string;
  start_time: string;
  end_time: string;
  check_in_at?: string | null;
  check_out_at?: string | null;
  break_minutes?: number | null;
  client_lat?: number | null;
  client_lng?: number | null;
  check_in_latitude?: number | null;
  check_in_longitude?: number | null;
  has_care_note?: boolean;
  requires_double_up?: boolean;
  missing_second_carer?: boolean;
  has_active_care_plan?: boolean;
};

export function isMissingCareNote(
  status: string,
  checkOutAt: string | null | undefined,
  hasNote: boolean
): boolean {
  if (hasNote) return false;
  if (status === "completed") return true;
  if (checkOutAt) return true;
  return false;
}

export function isLateCheckIn(
  scheduledStart: string,
  checkInAt: string | null | undefined,
  toleranceMinutes: number = VISIT_LATE_CHECKIN_TOLERANCE_MINUTES
): boolean {
  if (!checkInAt) {
    const display = resolveDisplayStatus("scheduled", scheduledStart, null);
    return display === "late";
  }
  const startMs = new Date(scheduledStart).getTime();
  const checkInMs = new Date(checkInAt).getTime();
  return checkInMs > startMs + toleranceMinutes * 60 * 1000;
}

export function visitDurationMinutes(
  checkInAt: string | null | undefined,
  checkOutAt: string | null | undefined,
  breakMinutes: number | null | undefined
): number | null {
  if (!checkInAt || !checkOutAt) return null;
  const raw = Math.floor(
    (new Date(checkOutAt).getTime() - new Date(checkInAt).getTime()) / 60000
  );
  return Math.max(0, raw - (breakMinutes ?? 0));
}

export function scheduledDurationMinutes(
  startTime: string,
  endTime: string
): number {
  return Math.max(
    0,
    Math.floor(
      (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000
    )
  );
}

export function isGpsMismatch(
  clientLat: number | null | undefined,
  clientLng: number | null | undefined,
  checkInLat: number | null | undefined,
  checkInLng: number | null | undefined,
  thresholdKm: number = DISTANCE_WARNING_KM
): boolean {
  if (
    clientLat == null ||
    clientLng == null ||
    checkInLat == null ||
    checkInLng == null
  ) {
    return false;
  }
  return haversineKm(clientLat, clientLng, checkInLat, checkInLng) > thresholdKm;
}

export function deriveVisitAuditFlags(input: VisitAuditInput) {
  const hasNote = !!input.has_care_note;
  const checkOut = input.check_out_at ?? null;
  const missingNotes = isMissingCareNote(input.status, checkOut, hasNote);
  const lateVisit =
    input.status === "missed" ||
    isLateCheckIn(input.start_time, input.check_in_at);
  const gpsMismatch = isGpsMismatch(
    input.client_lat,
    input.client_lng,
    input.check_in_latitude,
    input.check_in_longitude
  );
  const missedVisit = input.status === "missed";
  const doubleUpGap = !!(
    input.requires_double_up && input.missing_second_carer
  );
  const carePlanPresent = !!input.has_active_care_plan;
  const durationMinutes = visitDurationMinutes(
    input.check_in_at,
    input.check_out_at,
    input.break_minutes
  );

  return {
    missingNotes,
    lateVisit,
    gpsMismatch,
    missedVisit,
    doubleUpGap,
    carePlanPresent,
    durationMinutes,
    scheduledDurationMinutes: scheduledDurationMinutes(
      input.start_time,
      input.end_time
    ),
  };
}

export function formatDurationMinutes(minutes: number | null): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Note types highlighted as safeguarding / risk in the UI. */
export const HIGHLIGHT_NOTE_TYPES = new Set(["safeguarding", "risk"]);

export function isHighlightNoteType(noteType: string | null | undefined): boolean {
  if (!noteType) return false;
  return HIGHLIGHT_NOTE_TYPES.has(noteType.toLowerCase());
}
