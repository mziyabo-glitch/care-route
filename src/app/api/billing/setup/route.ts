import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/permissions";

function cleanUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

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
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Funder name is required" }, { status: 400 });
    const { data, error } = await supabase.rpc("upsert_funder", {
      p_agency_id: agencyId,
      p_id: cleanUuid(body.id),
      p_name: name,
      p_type: body.type ?? "private",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === "delete_funder") {
    const funderId = cleanUuid(body.funder_id);
    if (!funderId) return NextResponse.json({ error: "funder_id is required" }, { status: 400 });
    const { error } = await supabase.rpc("delete_funder", {
      p_agency_id: agencyId,
      p_funder_id: funderId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "upsert_billing_rate") {
    const funderId = cleanUuid(body.funder_id);
    if (!funderId) return NextResponse.json({ error: "funder_id is required" }, { status: 400 });
    const carerRole = typeof body.role === "string" ? body.role.trim().toLowerCase() : "";
    if (!carerRole) return NextResponse.json({ error: "role is required" }, { status: 400 });
    const { data, error } = await supabase.rpc("upsert_billing_rate", {
      p_agency_id: agencyId,
      p_funder_id: funderId,
      p_role: carerRole,
      p_amount: body.amount ?? 0,
      p_rate_type: body.rate_type ?? "hourly",
      p_id: cleanUuid(body.id),
      p_mileage_rate: body.mileage_rate ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === "delete_billing_rate") {
    const rateId = cleanUuid(body.rate_id);
    if (!rateId) return NextResponse.json({ error: "rate_id is required" }, { status: 400 });
    const { error } = await supabase.rpc("delete_billing_rate", {
      p_agency_id: agencyId,
      p_rate_id: rateId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_client_funder") {
    const clientId = cleanUuid(body.client_id);
    const funderId = cleanUuid(body.funder_id);
    if (!clientId) return NextResponse.json({ error: "Please select a client" }, { status: 400 });
    if (!funderId) return NextResponse.json({ error: "Please select a funder" }, { status: 400 });
    const { error } = await supabase.rpc("set_client_funder", {
      p_agency_id: agencyId,
      p_client_id: clientId,
      p_funder_id: funderId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "clear_client_funder") {
    const clientId = cleanUuid(body.client_id);
    if (!clientId) return NextResponse.json({ error: "client_id is required" }, { status: 400 });
    const { error } = await supabase.rpc("clear_client_funder", {
      p_agency_id: agencyId,
      p_client_id: clientId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
