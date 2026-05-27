import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  defaultComplianceDateRange,
  getComplianceIssues,
} from "@/lib/compliance-data";
import { loadOverdueCarePlanReviews } from "@/lib/care-plan-data";
import {
  loadCqcEvidenceForAgency,
  summariseCqcEvidence,
} from "@/lib/cqc-evidence-data";
import { canAccessCompliance, getCurrentRole } from "@/lib/permissions";
import { parseVisitMapDateParam } from "@/lib/visit-map";

const MAX_RANGE_DAYS = 90;

function rangeSpanDays(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  return Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

export async function GET(request: Request) {
  const { agencyId, role } = await getCurrentRole();

  if (!agencyId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessCompliance(role)) {
    return NextResponse.json(
      { error: "Compliance dashboard is for managers only" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const defaults = defaultComplianceDateRange();
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  const start =
    (startParam && parseVisitMapDateParam(startParam)) || defaults.start;
  const end = (endParam && parseVisitMapDateParam(endParam)) || defaults.end;

  if (startParam && !parseVisitMapDateParam(startParam)) {
    return NextResponse.json(
      { error: "start must be YYYY-MM-DD" },
      { status: 400 }
    );
  }
  if (endParam && !parseVisitMapDateParam(endParam)) {
    return NextResponse.json(
      { error: "end must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  if (start > end) {
    return NextResponse.json(
      { error: "start must be on or before end" },
      { status: 400 }
    );
  }

  if (rangeSpanDays(start, end) > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { error: `Date range cannot exceed ${MAX_RANGE_DAYS} days` },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  try {
    const { missed_visits, missing_notes } = await getComplianceIssues(
      supabase,
      agencyId,
      start,
      end
    );

    let overdue_care_plan_reviews: Awaited<
      ReturnType<typeof loadOverdueCarePlanReviews>
    > = [];
    let cqcItems: Awaited<ReturnType<typeof loadCqcEvidenceForAgency>> = [];
    try {
      overdue_care_plan_reviews = await loadOverdueCarePlanReviews(
        supabase,
        agencyId
      );
    } catch {
      /* schema not migrated yet */
    }
    try {
      cqcItems = await loadCqcEvidenceForAgency(supabase, agencyId);
    } catch {
      /* schema not migrated yet */
    }

    return NextResponse.json({
      start,
      end,
      missed_visits,
      missing_notes,
      overdue_care_plan_reviews,
      cqc_summary: summariseCqcEvidence(cqcItems),
      cqc_items: cqcItems,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load compliance data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
