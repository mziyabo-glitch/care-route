import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import type { CarePlanSectionRow } from "@/lib/care-plan-data";

async function loadSectionWithPlanClient(
  supabase: SupabaseClient,
  agencyId: string,
  sectionId: string
): Promise<{ section: CarePlanSectionRow; client_id: string } | null> {
  const { data: section, error } = await supabase
    .from("care_plan_sections")
    .select("*")
    .eq("id", sectionId)
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (error || !section) return null;

  const { data: plan } = await supabase
    .from("care_plans")
    .select("client_id, agency_id")
    .eq("id", (section as CarePlanSectionRow).care_plan_id)
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (!plan || (plan as { agency_id: string }).agency_id !== agencyId) {
    return null;
  }

  return {
    section: section as CarePlanSectionRow,
    client_id: (plan as { client_id: string }).client_id,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sectionId } = await params;
  const supabase = await createClient();

  const loaded = await loadSectionWithPlanClient(supabase, agencyId, sectionId);
  if (!loaded) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.title !== undefined) {
    updates.title = typeof body.title === "string" ? body.title : "";
  }
  if (body.body !== undefined) {
    updates.body = typeof body.body === "string" ? body.body : "";
  }
  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== "number" || !Number.isFinite(body.sort_order)) {
      return NextResponse.json({ error: "Invalid sort_order" }, { status: 400 });
    }
    updates.sort_order = Math.floor(body.sort_order);
  }
  if (body.section_key !== undefined) {
    updates.section_key =
      typeof body.section_key === "string" && body.section_key.trim()
        ? body.section_key.trim()
        : null;
  }

  const { data, error } = await supabase
    .from("care_plan_sections")
    .update(updates)
    .eq("id", sectionId)
    .eq("agency_id", agencyId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ section: data as CarePlanSectionRow });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sectionId } = await params;
  const supabase = await createClient();

  const loaded = await loadSectionWithPlanClient(supabase, agencyId, sectionId);
  if (!loaded) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("care_plan_sections")
    .delete()
    .eq("id", sectionId)
    .eq("agency_id", agencyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
