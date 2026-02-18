import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";

export async function GET() {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = await createClient();

  const membersPromise = supabase.rpc("list_agency_members", { p_agency_id: agencyId });
  const invitesPromise = supabase.rpc("list_invites", { p_agency_id: agencyId });
  const rolePromise = supabase.rpc("get_my_role", { p_agency_id: agencyId });

  const [membersRes, invitesRes, roleRes] = await Promise.all([
    membersPromise,
    invitesPromise.then(
      (r) => r,
      () => ({ data: [] as unknown[], error: null }),
    ),
    rolePromise,
  ]);

  if (membersRes.error) {
    return NextResponse.json({ error: membersRes.error.message }, { status: 400 });
  }

  return NextResponse.json({
    members: membersRes.data ?? [],
    invites: invitesRes.data ?? [],
    myRole: roleRes.data ?? "viewer",
  });
}

export async function POST(request: Request) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const { email, role } = body;

  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (!["admin", "manager", "viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invite", {
    p_agency_id: agencyId,
    p_email: email.trim(),
    p_role: role,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ invite: data });
}
