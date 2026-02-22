import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/permissions";

export async function GET(request: Request) {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (role !== "owner" && role !== "admin" && role !== "manager") {
    return NextResponse.json({ error: "Billing access is for managers only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const funderId = (searchParams.get("funder_id") ?? "").trim();
  if (!funderId) {
    return NextResponse.json({ error: "funder_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_funder_rates", {
    p_agency_id: agencyId,
    p_funder_id: funderId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rates: Array.isArray(data) ? data : [] });
}
