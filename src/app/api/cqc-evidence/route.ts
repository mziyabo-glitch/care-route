import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  CQC_CATEGORIES,
  createCqcEvidenceItem,
  loadCqcEvidenceForAgency,
  summariseCqcEvidence,
  type CqcCategory,
  type CqcEvidenceStatus,
  type CqcRiskLevel,
} from "@/lib/cqc-evidence-data";
import { canAccessCompliance, getCurrentRole } from "@/lib/permissions";

export async function GET() {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessCompliance(role)) {
    return NextResponse.json({ error: "Managers only" }, { status: 403 });
  }

  const supabase = await createClient();
  try {
    const items = await loadCqcEvidenceForAgency(supabase, agencyId);
    return NextResponse.json({
      items,
      summary: summariseCqcEvidence(items),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load evidence";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessCompliance(role)) {
    return NextResponse.json({ error: "Managers only" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const category = body.category as string;
  if (!CQC_CATEGORIES.includes(category as CqcCategory)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const status = (body.status as CqcEvidenceStatus) ?? "open";
  if (!["open", "in_review", "complete"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const risk = (body.risk as CqcRiskLevel) ?? "low";
  if (!["low", "medium", "high"].includes(risk)) {
    return NextResponse.json({ error: "Invalid risk" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const item = await createCqcEvidenceItem(supabase, agencyId, user.id, {
      category: category as CqcCategory,
      title,
      description: typeof body.description === "string" ? body.description : "",
      client_id: typeof body.client_id === "string" ? body.client_id : null,
      visit_id: typeof body.visit_id === "string" ? body.visit_id : null,
      care_plan_id: typeof body.care_plan_id === "string" ? body.care_plan_id : null,
      status,
      risk,
      due_date:
        typeof body.due_date === "string" && body.due_date.trim()
          ? body.due_date.trim()
          : null,
      owner: typeof body.owner === "string" ? body.owner : null,
    });
    return NextResponse.json({ item });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create evidence";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
