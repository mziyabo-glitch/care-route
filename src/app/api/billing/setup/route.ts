import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import { getCurrentRole } from "@/lib/permissions";

export async function GET() {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (role !== "owner" && role !== "admin" && role !== "manager") {
    return NextResponse.json({ error: "Billing access is for managers only" }, { status: 403 });
  }

  const supabase = await createClient();
  const [fundersRes, clientFundersRes, clientsRes] = await Promise.all([
    supabase.rpc("list_funders", { p_agency_id: agencyId }),
    supabase.rpc("list_client_funders", { p_agency_id: agencyId }),
    supabase.rpc("list_clients", { p_agency_id: agencyId }),
  ]);

  if (fundersRes.error) return NextResponse.json({ error: fundersRes.error.message }, { status: 500 });
  if (clientFundersRes.error) return NextResponse.json({ error: clientFundersRes.error.message }, { status: 500 });
  if (clientsRes.error) return NextResponse.json({ error: clientsRes.error.message }, { status: 500 });

  return NextResponse.json({
    funders: Array.isArray(fundersRes.data) ? fundersRes.data : [],
    clientFunders: Array.isArray(clientFundersRes.data) ? clientFundersRes.data : [],
    clients: Array.isArray(clientsRes.data) ? clientsRes.data : [],
  });
}

export async function POST(request: Request) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (role !== "owner" && role !== "admin" && role !== "manager") {
    return NextResponse.json({ error: "Billing access is for managers only" }, { status: 403 });
  }

  const body = await request.json();
  const action = body.action as string;

  const supabase = await createClient();

  if (action === "upsert_funder") {
    const { data, error } = await supabase.rpc("upsert_funder", {
      p_agency_id: agencyId,
      p_id: body.id ?? null,
      p_name: body.name,
      p_type: body.type ?? "private",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === "delete_funder") {
    const { error } = await supabase.rpc("delete_funder", {
      p_agency_id: agencyId,
      p_funder_id: body.funder_id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "upsert_funder_rate") {
    const { data, error } = await supabase.rpc("upsert_funder_rate", {
      p_agency_id: agencyId,
      p_funder_id: body.funder_id,
      p_id: body.id ?? null,
      p_rate_type: body.rate_type,
      p_hourly_rate: body.hourly_rate,
      p_mileage_rate: body.mileage_rate ?? null,
      p_effective_from: body.effective_from,
      p_effective_to: body.effective_to ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === "set_client_funder") {
    const { error } = await supabase.rpc("set_client_funder", {
      p_agency_id: agencyId,
      p_client_id: body.client_id,
      p_funder_id: body.funder_id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "clear_client_funder") {
    const { error } = await supabase.rpc("clear_client_funder", {
      p_agency_id: agencyId,
      p_client_id: body.client_id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
