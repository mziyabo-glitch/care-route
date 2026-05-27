import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/permissions";
import { canAccessCompliance } from "@/lib/permissions";
import { canViewRestrictedCarePlan } from "@/lib/roles";
import { fetchAgencyName } from "@/lib/agency";
import { loadCarePlanReviewStats, type OverdueCarePlanReview } from "@/lib/care-plan-data";
import { getComplianceIssues } from "@/lib/compliance-data";
import {
  CQC_CATEGORY_LABELS,
  CQC_CATEGORIES,
  loadCqcEvidenceForAgency,
  summariseCqcEvidence,
  type CqcCategory,
} from "@/lib/cqc-evidence-data";
import { resolveUserGreetingName } from "@/lib/user-display-name";
import { getVisitMapRows, type VisitMapRow } from "@/lib/visit-map-data";

export { resolveUserGreetingName } from "@/lib/user-display-name";
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
  callWindow: string | null;
  isDoubleUp: boolean;
  displayStatus: VisitMapDisplayStatus;
  status: string;
};

export type DashboardCqcCategoryCard = {
  category: CqcCategory;
  label: string;
  open: number;
  overdue: number;
  highRiskOpen: number;
};

export type DashboardCarePlanReviews = {
  visible: boolean;
  overdue: number;
  dueThisWeek: number;
  upToDate: number;
  topOverdue: OverdueCarePlanReview[];
};

export type DashboardConfidentiality = {
  restrictedSectionCount: number;
  canViewRestricted: boolean;
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
    late: number;
    missed: number;
    completedWithoutNotes: number;
    carePlansOverdue: number;
    highRiskCqcOpen: number;
  };
  priorityActions: DashboardActionItem[];
  happeningNow: DashboardTimelineItem[];
  upNext: DashboardTimelineItem[];
  laterToday: DashboardTimelineItem[];
  cqcReadiness: {
    visible: boolean;
    categories: DashboardCqcCategoryCard[];
    totalHighRiskOpen: number;
  };
  carePlanReviews: DashboardCarePlanReviews;
  confidentiality: DashboardConfidentiality;
};

/** UK domiciliary call windows (minutes from midnight, Europe/London). */
const UK_CALL_WINDOWS = [
  { name: "Morning", startMin: 7 * 60, endMin: 10 * 60 + 30 },
  { name: "Lunch", startMin: 11 * 60 + 30, endMin: 14 * 60 },
  { name: "Tea", startMin: 15 * 60 + 30, endMin: 18 * 60 + 30 },
  { name: "Bedtime", startMin: 19 * 60, endMin: 22 * 60 + 30 },
] as const;

function londonMinutesFromMidnight(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function callWindowForStart(startTime: string): string | null {
  const min = londonMinutesFromMidnight(startTime);
  for (const w of UK_CALL_WINDOWS) {
    if (min >= w.startMin && min < w.endMin) return w.name;
  }
  return null;
}

function visitInCallWindow(startTime: string): boolean {
  return callWindowForStart(startTime) != null;
}

/** Dashboard never surfaces visit note or care note bodies. */
const DASHBOARD_TASK_LABEL = "Care visit";

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
    user?: {
      email?: string | null;
      user_metadata?: Record<string, unknown>;
    };
    role: Role | null;
  }
): Promise<DashboardData> {
  const today = todayInLondon();
  const now = new Date();

  const showGovernance = canAccessCompliance(options.role);

  const [
    agencyName,
    visitRows,
    complianceToday,
    weekVisitsRes,
    carePlanStats,
    cqcItems,
    restrictedSectionsRes,
  ] = await Promise.all([
    fetchAgencyName(supabase, agencyId),
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
    showGovernance
      ? loadCarePlanReviewStats(supabase, agencyId, today).catch(() => ({
          overdue: 0,
          dueThisWeek: 0,
          upToDate: 0,
          topOverdue: [],
        }))
      : Promise.resolve({
          overdue: 0,
          dueThisWeek: 0,
          upToDate: 0,
          topOverdue: [],
        }),
    showGovernance
      ? loadCqcEvidenceForAgency(supabase, agencyId).catch(() => [])
      : Promise.resolve([]),
    supabase
      .from("care_plan_sections")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .eq("confidentiality_level", "restricted"),
  ]);
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
  let late = 0;
  let missed = 0;
  let completedWithoutNotes = 0;

  const carerNamesById = new Map<string, string>();

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
    if (ds === "late") late += 1;
    if (ds === "missed") missed += 1;
    if (v.missing_care_note) completedWithoutNotes += 1;

    v.carer_ids.forEach((id, i) => {
      const name = v.carer_names[i] ?? carerNamesById.get(id) ?? "Carer";
      carerNamesById.set(id, name);
    });
  }

  const cqcSummary = summariseCqcEvidence(cqcItems);

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
    const base = {
      id: v.id,
      clientId: v.client_id,
      clientName: v.client_name,
      startTime: v.start_time,
      endTime: v.end_time,
      taskLabel: DASHBOARD_TASK_LABEL,
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
    if (
      (missingNoteIds.has(v.id) || v.missing_care_note) &&
      (v.status === "completed" || v.check_out_at)
    ) {
      considerAction({
        ...base,
        priority: actionPriority("no_notes"),
        reason: "Care note missing after visit",
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

  const priorityActions = [...needsActionById.values()]
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    )
    .slice(0, 5);

  const timelineFromRow = (v: VisitMapRow): DashboardTimelineItem => {
    const raw = weekVisits.find((w) => w.id === v.id);
    return {
      id: v.id,
      clientName: v.client_name,
      carerNames: v.carer_names,
      startTime: v.start_time,
      endTime: v.end_time,
      taskLabel: DASHBOARD_TASK_LABEL,
      callWindow: callWindowForStart(v.start_time),
      isDoubleUp: !!raw?.is_joint || !!raw?.requires_double_up,
      displayStatus: v.display_status,
      status: v.status,
    };
  };

  const isHappeningNow = (v: VisitMapRow) => {
    if (v.display_status === "in_progress" || v.display_status === "late") {
      return visitInCallWindow(v.start_time);
    }
    if (v.display_status === "due_soon") {
      const startMs = new Date(v.start_time).getTime();
      return (
        visitInCallWindow(v.start_time) &&
        startMs <= now.getTime() + 60 * 60 * 1000
      );
    }
    return false;
  };

  const happeningNow = visitRows
    .filter(isHappeningNow)
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    .slice(0, 6)
    .map(timelineFromRow);

  const happeningIds = new Set(happeningNow.map((h) => h.id));

  const upNext = visitRows
    .filter(
      (v) =>
        !happeningIds.has(v.id) &&
        (v.display_status === "scheduled" || v.display_status === "due_soon") &&
        new Date(v.start_time).getTime() > now.getTime() &&
        visitInCallWindow(v.start_time)
    )
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    .slice(0, 4)
    .map(timelineFromRow);

  const nextIds = new Set(upNext.map((u) => u.id));

  const laterToday = visitRows
    .filter(
      (v) =>
        !happeningIds.has(v.id) &&
        !nextIds.has(v.id) &&
        (v.display_status === "scheduled" || v.display_status === "due_soon") &&
        new Date(v.start_time).getTime() > now.getTime() &&
        visitInCallWindow(v.start_time)
    )
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    .slice(0, 6)
    .map(timelineFromRow);

  const attentionCount = priorityActions.length;
  const operationalLine =
    attentionCount === 0
      ? "No urgent items for today — keep monitoring visits."
      : attentionCount === 1
        ? "1 item needs your attention today."
        : `${attentionCount} items need your attention today.`;

  const canViewRestricted = canViewRestrictedCarePlan(options.role);

  const cqcCategories: DashboardCqcCategoryCard[] = CQC_CATEGORIES.map(
    (category) => ({
      category,
      label: CQC_CATEGORY_LABELS[category],
      open: cqcSummary.by_category[category].open,
      overdue: cqcSummary.by_category[category].overdue,
      highRiskOpen: cqcSummary.by_category[category].high_risk_open,
    })
  );

  return {
    agencyName,
    greetingName: resolveUserGreetingName(options.user ?? {}),
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
      late,
      missed,
      completedWithoutNotes,
      carePlansOverdue: showGovernance ? carePlanStats.overdue : 0,
      highRiskCqcOpen: showGovernance
        ? cqcSummary.high_risk_open_count
        : 0,
    },
    priorityActions,
    happeningNow,
    upNext,
    laterToday,
    cqcReadiness: {
      visible: showGovernance,
      categories: cqcCategories,
      totalHighRiskOpen: cqcSummary.high_risk_open_count,
    },
    carePlanReviews: {
      visible: showGovernance,
      overdue: carePlanStats.overdue,
      dueThisWeek: carePlanStats.dueThisWeek,
      upToDate: carePlanStats.upToDate,
      topOverdue: carePlanStats.topOverdue,
    },
    confidentiality: {
      restrictedSectionCount: restrictedSectionsRes.count ?? 0,
      canViewRestricted,
    },
  };
}

export function formatDashboardMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export { formatUkTime };
