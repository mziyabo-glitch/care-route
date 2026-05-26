import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/permissions";
import { canAccessCompliance, canEdit } from "@/lib/permissions";
import { getComplianceIssues } from "@/lib/compliance-data";
import { getVisitMapRows, type VisitMapRow } from "@/lib/visit-map-data";
import {
  dayRangeUtc,
  formatUkTime,
  todayInLondon,
  type VisitMapDisplayStatus,
} from "@/lib/visit-map";

type WeekVisit = {
  id: string;
  client_id: string;
  client_name?: string | null;
  status?: string;
  start_time: string;
  end_time: string;
  notes?: string | null;
  assignments?: unknown;
  requires_double_up?: boolean;
  missing_second_carer?: boolean;
  is_joint?: boolean;
};

export type DashboardActionItem = {
  id: string;
  clientId: string;
  clientName: string;
  startTime: string;
  endTime: string;
  taskLabel: string;
  carerNames: string[];
  status: string;
  displayStatus: VisitMapDisplayStatus;
  priority: number;
  reason: string;
  href: string;
};

export type DashboardTimelineItem = {
  id: string;
  clientName: string;
  carerNames: string[];
  startTime: string;
  endTime: string;
  taskLabel: string;
  isDoubleUp: boolean;
  displayStatus: VisitMapDisplayStatus;
  status: string;
};

export type DashboardComplianceMetric = {
  id: string;
  label: string;
  value: number | null;
  tracked: boolean;
  href?: string;
};

export type DashboardPayrollBilling = {
  visible: boolean;
  payrollVisible: boolean;
  completedMinutes: number;
  payrollMinutes: number;
  billableMinutes: number;
  missedVisits: number;
};

export type DashboardData = {
  agencyName: string;
  greetingName: string;
  todayDate: string;
  todayFormatted: string;
  operationalLine: string;
  safety: {
    visitsToday: number;
    completed: number;
    upcomingOrInProgress: number;
    late: number;
    missed: number;
    completedWithoutNotes: number;
  };
  needsAction: DashboardActionItem[];
  happeningNow: DashboardTimelineItem[];
  upNext: DashboardTimelineItem[];
  rotaCapacity: {
    totalCarers: number;
    assignedToday: number;
    spare: number;
    doubleUpCount: number;
    busiestCarers: { name: string; visitCount: number }[];
  };
  compliancePulse: DashboardComplianceMetric[];
  payrollBilling: DashboardPayrollBilling;
  visitMapPreview: {
    visible: boolean;
    rows: VisitMapRow[];
    geocodedCount: number;
    lateCount: number;
    missedCount: number;
  };
};

function greetingFromEmail(email: string | undefined): string {
  if (!email) return "there";
  const local = email.split("@")[0] ?? "";
  const bit = local.split(/[.+_-]/)[0];
  if (!bit) return "there";
  return bit.charAt(0).toUpperCase() + bit.slice(1).toLowerCase();
}

function taskLabelFromNotes(notes: string | null | undefined): string {
  if (!notes?.trim()) return "Care visit";
  const first = notes.trim().split(/\n/)[0] ?? "";
  const cleaned = first.replace(/\[DEMO_VISIT_SEED\]/gi, "").trim();
  if (!cleaned) return "Care visit";
  return cleaned.length > 48 ? `${cleaned.slice(0, 45)}…` : cleaned;
}

function payrollMinutesForVisit(
  startTime: string,
  endTime: string,
  actual?: {
    check_in_at: string | null;
    check_out_at: string | null;
    break_minutes?: number | null;
  }
): number {
  if (actual?.check_in_at && actual?.check_out_at) {
    const raw = Math.floor(
      (new Date(actual.check_out_at).getTime() -
        new Date(actual.check_in_at).getTime()) /
        60000
    );
    return Math.max(0, raw - (actual.break_minutes ?? 0));
  }
  return Math.max(
    0,
    Math.floor(
      (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000
    )
  );
}

function actionPriority(
  kind: "missed" | "late" | "no_notes" | "checked_in" | "double_up"
): number {
  switch (kind) {
    case "missed":
      return 0;
    case "late":
      return 1;
    case "checked_in":
      return 2;
    case "no_notes":
      return 3;
    case "double_up":
      return 4;
    default:
      return 9;
  }
}

/**
 * Agency-scoped dashboard payload. Uses getCurrentAgencyId() at the page layer;
 * all queries/RPCs pass that id — never trust client-supplied agency_id.
 */
export async function loadDashboardData(
  supabase: SupabaseClient,
  agencyId: string,
  options: {
    userEmail?: string;
    role: Role | null;
  }
): Promise<DashboardData> {
  const today = todayInLondon();
  const now = new Date();

  const [
    agencyRes,
    carersCountRes,
    visitRows,
    complianceToday,
    weekVisitsRes,
  ] = await Promise.all([
    supabase.from("agencies").select("name").eq("id", agencyId).single(),
    supabase.rpc("count_carers", { p_agency_id: agencyId }),
    getVisitMapRows(supabase, agencyId, today),
    getComplianceIssues(supabase, agencyId, today, today).catch(() => ({
      missed_visits: [],
      missing_notes: [],
    })),
    supabase.rpc("list_visits_for_week", {
      p_agency_id: agencyId,
      p_week_start: dayRangeUtc(today).start,
      p_week_end: dayRangeUtc(today).end,
    }),
  ]);

  const agencyName = agencyRes.data?.name ?? "Your agency";
  const totalCarers = Number(carersCountRes.data ?? 0);
  const weekVisits: WeekVisit[] = Array.isArray(weekVisitsRes.data)
    ? (weekVisitsRes.data as WeekVisit[])
    : [];

  const visitIds = visitRows.map((v) => v.id);
  const actualsByVisit: Record<
    string,
    {
      check_in_at: string | null;
      check_out_at: string | null;
      break_minutes: number | null;
    }
  > = {};

  if (visitIds.length > 0) {
    const { data: actuals } = await supabase
      .from("visit_actuals")
      .select("visit_id, check_in_at, check_out_at, break_minutes")
      .eq("agency_id", agencyId)
      .in("visit_id", visitIds);

    for (const row of actuals ?? []) {
      if (typeof row.visit_id === "string") {
        actualsByVisit[row.visit_id] = {
          check_in_at: row.check_in_at,
          check_out_at: row.check_out_at,
          break_minutes: row.break_minutes ?? null,
        };
      }
    }
  }

  let completed = 0;
  let upcomingOrInProgress = 0;
  let late = 0;
  let missed = 0;
  let completedWithoutNotes = 0;
  let doubleUpCount = 0;
  let completedMinutes = 0;
  let payrollMinutes = 0;

  const carerVisitCounts = new Map<string, number>();
  const carerNamesById = new Map<string, string>();
  const assignedCarerIds = new Set<string>();

  for (const w of weekVisits) {
    if (!Array.isArray(w.assignments)) continue;
    for (const a of w.assignments) {
      if (a && typeof a === "object" && "carer_id" in a && "carer_name" in a) {
        const entry = a as { carer_id?: string; carer_name?: string | null };
        if (entry.carer_id && entry.carer_name) {
          carerNamesById.set(entry.carer_id, entry.carer_name);
        }
      }
    }
  }

  for (const v of visitRows) {
    const ds = v.display_status;
    if (ds === "completed") completed += 1;
    if (
      ds === "scheduled" ||
      ds === "due_soon" ||
      ds === "in_progress" ||
      ds === "late"
    ) {
      upcomingOrInProgress += 1;
    }
    if (ds === "late") late += 1;
    if (ds === "missed") missed += 1;
    if (v.missing_care_note && ds === "completed") completedWithoutNotes += 1;

    v.carer_ids.forEach((id, i) => {
      assignedCarerIds.add(id);
      const name = v.carer_names[i] ?? carerNamesById.get(id) ?? "Carer";
      carerNamesById.set(id, name);
      carerVisitCounts.set(id, (carerVisitCounts.get(id) ?? 0) + 1);
    });

    if (v.status === "completed") {
      const actual = actualsByVisit[v.id];
      completedMinutes += payrollMinutesForVisit(
        v.start_time,
        v.end_time,
        actual
      );
    }
    if (["completed", "in_progress", "scheduled"].includes(v.status)) {
      payrollMinutes += payrollMinutesForVisit(
        v.start_time,
        v.end_time,
        actualsByVisit[v.id]
      );
    }
  }

  doubleUpCount = weekVisits.filter(
    (w) => w.is_joint || w.requires_double_up
  ).length;

  const busiestCarers = [...carerVisitCounts.entries()]
    .map(([id, visitCount]) => ({
      name: carerNamesById.get(id) ?? "Carer",
      visitCount,
    }))
    .sort((a, b) => b.visitCount - a.visitCount)
    .slice(0, 3);

  const needsActionById = new Map<string, DashboardActionItem>();
  const missedIds = new Set(complianceToday.missed_visits.map((m) => m.id));
  const missingNoteIds = new Set(complianceToday.missing_notes.map((m) => m.id));

  const considerAction = (item: DashboardActionItem) => {
    const existing = needsActionById.get(item.id);
    if (!existing || item.priority < existing.priority) {
      needsActionById.set(item.id, item);
    }
  };

  for (const v of visitRows) {
    const raw = weekVisits.find((w) => w.id === v.id);
    const taskLabel = taskLabelFromNotes(raw?.notes);
    const base = {
      id: v.id,
      clientId: v.client_id,
      clientName: v.client_name,
      startTime: v.start_time,
      endTime: v.end_time,
      taskLabel,
      carerNames: v.carer_names,
      status: v.status,
      displayStatus: v.display_status,
      href: `/visits`,
    };

    if (missedIds.has(v.id) || v.display_status === "missed") {
      considerAction({
        ...base,
        priority: actionPriority("missed"),
        reason: "Missed visit",
      });
    }
    if (v.display_status === "late") {
      considerAction({
        ...base,
        priority: actionPriority("late"),
        reason: "Late — not checked in",
      });
    }
    if (
      v.display_status === "in_progress" &&
      v.check_in_at &&
      !v.check_out_at
    ) {
      considerAction({
        ...base,
        priority: actionPriority("checked_in"),
        reason: "Checked in — not checked out",
      });
    }
    if (missingNoteIds.has(v.id) || v.missing_care_note) {
      considerAction({
        ...base,
        priority: actionPriority("no_notes"),
        reason: "Completed without care note",
      });
    }
    if (raw?.missing_second_carer) {
      considerAction({
        ...base,
        priority: actionPriority("double_up"),
        reason: "Double-up — second carer missing",
      });
    }
  }

  const needsAction = [...needsActionById.values()].sort(
    (a, b) =>
      a.priority - b.priority ||
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const timelineFromRow = (v: VisitMapRow): DashboardTimelineItem => {
    const raw = weekVisits.find((w) => w.id === v.id);
    return {
      id: v.id,
      clientName: v.client_name,
      carerNames: v.carer_names,
      startTime: v.start_time,
      endTime: v.end_time,
      taskLabel: taskLabelFromNotes(raw?.notes),
      isDoubleUp: !!raw?.is_joint || !!raw?.requires_double_up,
      displayStatus: v.display_status,
      status: v.status,
    };
  };

  const happeningNow = visitRows
    .filter(
      (v) =>
        v.display_status === "in_progress" ||
        (v.display_status === "due_soon" &&
          new Date(v.start_time).getTime() <= now.getTime() + 60 * 60 * 1000)
    )
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    .slice(0, 6)
    .map(timelineFromRow);

  const upNext = visitRows
    .filter(
      (v) =>
        (v.display_status === "scheduled" || v.display_status === "due_soon") &&
        new Date(v.start_time).getTime() > now.getTime()
    )
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    .slice(0, 6)
    .map(timelineFromRow);

  const attentionCount = needsAction.length;
  const operationalLine =
    attentionCount === 0
      ? "No urgent items for today — keep monitoring visits."
      : attentionCount === 1
        ? "1 item needs your attention today."
        : `${attentionCount} items need your attention today.`;

  const showCompliance = canAccessCompliance(options.role);
  const showBilling = canEdit(options.role);
  const showPayroll =
    options.role === "owner" || options.role === "admin";

  let billableMinutes = 0;
  if (showBilling) {
    const { start, end } = dayRangeUtc(today);
    const { data: billingRows } = await supabase.rpc("list_billing_for_range", {
      p_agency_id: agencyId,
      p_start: start,
      p_end: end,
    });
    for (const row of Array.isArray(billingRows) ? billingRows : []) {
      const r = row as { billable_minutes?: number };
      billableMinutes += r.billable_minutes ?? 0;
    }
  }

  const compliancePulse: DashboardComplianceMetric[] = [
    {
      id: "missed_today",
      label: "Missed visits (today)",
      value: showCompliance ? missed : null,
      tracked: showCompliance,
      href: "/compliance",
    },
    {
      id: "missing_notes_today",
      label: "Without care notes (today)",
      value: showCompliance ? completedWithoutNotes : null,
      tracked: showCompliance,
      href: "/compliance",
    },
    {
      id: "late_today",
      label: "Late / not checked in (today)",
      value: showCompliance ? late : null,
      tracked: showCompliance,
    },
    {
      id: "double_up_gaps",
      label: "Double-up staffing gaps (today)",
      value: showCompliance
        ? weekVisits.filter((w) => w.missing_second_carer).length
        : null,
      tracked: showCompliance,
    },
    {
      id: "care_plan_review",
      label: "Care plan reviews overdue",
      value: null,
      tracked: false,
    },
    {
      id: "training_expiry",
      label: "Training / competency expiry",
      value: null,
      tracked: false,
    },
    {
      id: "safeguarding",
      label: "Safeguarding flags open",
      value: null,
      tracked: false,
    },
  ];

  const geocodedCount = visitRows.filter(
    (r) => r.client_lat != null && r.client_lng != null
  ).length;

  return {
    agencyName,
    greetingName: greetingFromEmail(options.userEmail),
    todayDate: today,
    todayFormatted: new Date(`${today}T12:00:00Z`).toLocaleDateString("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    operationalLine,
    safety: {
      visitsToday: visitRows.length,
      completed,
      upcomingOrInProgress,
      late,
      missed,
      completedWithoutNotes,
    },
    needsAction: needsAction.slice(0, 12),
    happeningNow,
    upNext,
    rotaCapacity: {
      totalCarers,
      assignedToday: assignedCarerIds.size,
      spare: Math.max(0, totalCarers - assignedCarerIds.size),
      doubleUpCount,
      busiestCarers,
    },
    compliancePulse,
    payrollBilling: {
      visible: showBilling || showPayroll,
      payrollVisible: showPayroll,
      completedMinutes,
      payrollMinutes,
      billableMinutes,
      missedVisits: missed,
    },
    visitMapPreview: {
      visible: showBilling,
      rows: visitRows.slice(0, 8),
      geocodedCount,
      lateCount: late,
      missedCount: missed,
    },
  };
}

export function formatDashboardMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export { formatUkTime };
