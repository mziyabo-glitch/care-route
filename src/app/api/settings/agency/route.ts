import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId, fetchAgencyName } from "@/lib/agency";
import { canEdit, getCurrentRole } from "@/lib/permissions";

export async function PATCH(request: Request) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { role } = await getCurrentRole();
  if (!canEdit(role)) {
    return NextResponse.json(
      { error: "Only owner, admin, or manager can update the agency name" },
      { status: 403 }
    );
  }

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) {
    return NextResponse.json(
      { error: "Agency name must be between 1 and 200 characters" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("update_agency_name", {
    p_agency_id: agencyId,
    p_name: name,
  });

  if (error) {
    if (role === "owner" && error.message.includes("update_agency_name")) {
      const { error: directErr } = await supabase
        .from("agencies")
        .update({ name })
        .eq("id", agencyId);
      if (directErr) {
        return NextResponse.json({ error: directErr.message }, { status: 400 });
      }
      return NextResponse.json({ name });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const parsed = data as { name?: string } | null;
  const resolved =
    typeof parsed?.name === "string"
      ? parsed.name
      : await fetchAgencyName(supabase, agencyId);

  return NextResponse.json({ name: resolved });
}
