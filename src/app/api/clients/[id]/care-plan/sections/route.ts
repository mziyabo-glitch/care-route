import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import {
  getCarePlanByIdForClient,
  verifyClientBelongsToAgency,
  type CarePlanSectionRow,
} from "@/lib/care-plan-data";

export async function POST(
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

  const plan = await getCarePlanByIdForClient(supabase, agencyId, planId, clientId);
  if (!plan) {
    return NextResponse.json({ error: "Care plan not found" }, { status: 404 });
  }

  const title = typeof body.title === "string" ? body.title : "";
  const sectionBody = typeof body.body === "string" ? body.body : "";
  const sort_order =
    typeof body.sort_order === "number" && Number.isFinite(body.sort_order)
      ? Math.floor(body.sort_order)
      : 0;
  const section_key =
    typeof body.section_key === "string" && body.section_key.trim()
      ? body.section_key.trim()
      : null;

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("care_plan_sections")
    .insert({
      agency_id: agencyId,
      care_plan_id: planId,
      title,
      body: sectionBody,
      sort_order,
      section_key,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ section: data as CarePlanSectionRow });
}
