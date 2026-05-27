import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import { canWriteCarePlan, getCurrentRole } from "@/lib/permissions";
import {
  DEFAULT_CARE_PLAN_SECTION_TEMPLATES,
  getCarePlanByIdForClient,
  loadArchivedCarePlans,
  loadCarePlanBundle,
  loadCarePlanSections,
  verifyClientBelongsToAgency,
  type CarePlanRow,
} from "@/lib/care-plan-data";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: clientId } = await params;
  const supabase = await createClient();

  const ok = await verifyClientBelongsToAgency(supabase, clientId, agencyId);
  if (!ok) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const planIdParam = url.searchParams.get("plan_id")?.trim() ?? "";

  try {
    if (planIdParam) {
      const plan = await getCarePlanByIdForClient(
        supabase,
        agencyId,
        planIdParam,
        clientId
      );
      if (!plan) {
        return NextResponse.json({ error: "Care plan not found" }, { status: 404 });
      }
      const sections = await loadCarePlanSections(supabase, agencyId, plan.id);
      return NextResponse.json({ plan, sections, read_only: plan.status === "archived" });
    }

    const bundle = await loadCarePlanBundle(supabase, agencyId, clientId);
    const archived_plans = await loadArchivedCarePlans(supabase, agencyId, clientId);
    return NextResponse.json({ ...bundle, archived_plans });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load care plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canWriteCarePlan(role)) {
    return NextResponse.json({ error: "Managers only" }, { status: 403 });
  }

  const { id: clientId } = await params;
  const supabase = await createClient();

  const ok = await verifyClientBelongsToAgency(supabase, clientId, agencyId);
  if (!ok) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { count: existingOpen } = await supabase
    .from("care_plans")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("agency_id", agencyId)
    .neq("status", "archived");

  if (existingOpen && existingOpen >= 1) {
    return NextResponse.json(
      {
        error:
          "A care plan already exists for this client. Edit it, or archive it before creating a new one.",
      },
      { status: 409 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const statusRaw = (body.status as string) ?? "draft";
  if (!["draft", "active", "archived"].includes(statusRaw)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const version =
    typeof body.version === "number" && body.version >= 1
      ? Math.floor(body.version)
      : 1;

  const effective_from =
    typeof body.effective_from === "string" && body.effective_from.trim()
      ? body.effective_from.trim()
      : null;
  const effective_to =
    typeof body.effective_to === "string" && body.effective_to.trim()
      ? body.effective_to.trim()
      : null;

  const now = new Date().toISOString();

  const insert = {
    agency_id: agencyId,
    client_id: clientId,
    status: statusRaw,
    version,
    effective_from,
    effective_to,
    created_by: user.id,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("care_plans")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "An active care plan already exists for this client. Archive or change the existing plan first." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const plan = data as CarePlanRow;
  const review_due_default = new Date();
  review_due_default.setUTCDate(review_due_default.getUTCDate() + 90);
  const review_due_date = review_due_default.toISOString().slice(0, 10);

  await supabase
    .from("care_plans")
    .update({ review_due_date, updated_at: now })
    .eq("id", plan.id)
    .eq("agency_id", agencyId);

  const sectionRows = DEFAULT_CARE_PLAN_SECTION_TEMPLATES.map((t) => ({
    agency_id: agencyId,
    care_plan_id: plan.id,
    title: t.title,
    body: "",
    sort_order: t.sort_order,
    section_key: t.section_key,
    confidentiality_level: t.confidentiality_level ?? "standard",
    updated_at: now,
  }));

  const { error: sectionsError } = await supabase
    .from("care_plan_sections")
    .insert(sectionRows);

  if (sectionsError) {
    return NextResponse.json(
      { error: `Plan created but default sections failed: ${sectionsError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ plan });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canWriteCarePlan(role)) {
    return NextResponse.json({ error: "Managers only" }, { status: 403 });
  }

  const { id: clientId } = await params;
  const supabase = await createClient();

  const ok = await verifyClientBelongsToAgency(supabase, clientId, agencyId);
  if (!ok) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const planId = typeof body.plan_id === "string" ? body.plan_id.trim() : "";
  if (!planId) {
    return NextResponse.json({ error: "plan_id is required" }, { status: 400 });
  }

  const existing = await getCarePlanByIdForClient(supabase, agencyId, planId, clientId);
  if (!existing) {
    return NextResponse.json({ error: "Care plan not found" }, { status: 404 });
  }

  if (existing.status === "archived") {
    return NextResponse.json(
      { error: "Archived care plans are read-only." },
      { status: 403 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (body.mark_reviewed === true) {
    const now = new Date().toISOString();
    const nextReview = new Date();
    nextReview.setUTCDate(nextReview.getUTCDate() + 90);
    const { data, error } = await supabase
      .from("care_plans")
      .update({
        last_reviewed_at: now,
        last_reviewed_by: user?.id ?? null,
        review_due_date: nextReview.toISOString().slice(0, 10),
        updated_at: now,
      })
      .eq("id", planId)
      .eq("agency_id", agencyId)
      .eq("client_id", clientId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ plan: data as CarePlanRow });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.status !== undefined) {
    const s = String(body.status);
    if (!["draft", "active", "archived"].includes(s)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = s;
  }
  if (body.version !== undefined) {
    if (typeof body.version !== "number" || body.version < 1) {
      return NextResponse.json({ error: "Invalid version" }, { status: 400 });
    }
    updates.version = Math.floor(body.version);
  }
  if (body.effective_from !== undefined) {
    updates.effective_from =
      typeof body.effective_from === "string" && body.effective_from.trim()
        ? body.effective_from.trim()
        : null;
  }
  if (body.effective_to !== undefined) {
    updates.effective_to =
      typeof body.effective_to === "string" && body.effective_to.trim()
        ? body.effective_to.trim()
        : null;
  }
  if (body.review_due_date !== undefined) {
    updates.review_due_date =
      typeof body.review_due_date === "string" && body.review_due_date.trim()
        ? body.review_due_date.trim()
        : null;
  }
  if (body.confidentiality_level !== undefined) {
    const level = String(body.confidentiality_level);
    if (!["standard", "restricted"].includes(level)) {
      return NextResponse.json({ error: "Invalid confidentiality_level" }, { status: 400 });
    }
    updates.confidentiality_level = level;
  }

  const { data, error } = await supabase
    .from("care_plans")
    .update(updates)
    .eq("id", planId)
    .eq("agency_id", agencyId)
    .eq("client_id", clientId)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Another active care plan already exists for this client." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ plan: data as CarePlanRow });
}
