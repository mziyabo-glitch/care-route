import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  CQC_CATEGORIES,
  updateCqcEvidenceItem,
  type CqcCategory,
  type CqcEvidenceStatus,
  type CqcRiskLevel,
} from "@/lib/cqc-evidence-data";
import { canAccessCompliance, getCurrentRole } from "@/lib/permissions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessCompliance(role)) {
    return NextResponse.json({ error: "Managers only" }, { status: 403 });
  }

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Parameters<typeof updateCqcEvidenceItem>[3] = {};

  if (body.category !== undefined) {
    if (!CQC_CATEGORIES.includes(body.category as CqcCategory)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    updates.category = body.category as CqcCategory;
  }
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    }
    updates.title = title;
  }
  if (body.description !== undefined) {
    updates.description = typeof body.description === "string" ? body.description : "";
  }
  if (body.status !== undefined) {
    const status = body.status as CqcEvidenceStatus;
    if (!["open", "in_review", "complete"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = status;
  }
  if (body.risk !== undefined) {
    const risk = body.risk as CqcRiskLevel;
    if (!["low", "medium", "high"].includes(risk)) {
      return NextResponse.json({ error: "Invalid risk" }, { status: 400 });
    }
    updates.risk = risk;
  }
  if (body.due_date !== undefined) {
    updates.due_date =
      typeof body.due_date === "string" && body.due_date.trim()
        ? body.due_date.trim()
        : null;
  }
  if (body.owner !== undefined) {
    updates.owner = typeof body.owner === "string" ? body.owner : null;
  }
  if (body.client_id !== undefined) {
    updates.client_id = typeof body.client_id === "string" ? body.client_id : null;
  }
  if (body.visit_id !== undefined) {
    updates.visit_id = typeof body.visit_id === "string" ? body.visit_id : null;
  }
  if (body.care_plan_id !== undefined) {
    updates.care_plan_id =
      typeof body.care_plan_id === "string" ? body.care_plan_id : null;
  }

  const supabase = await createClient();
  try {
    const item = await updateCqcEvidenceItem(supabase, agencyId, id, updates);
    return NextResponse.json({ item });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update evidence";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
