import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function GET() {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: raw, error } = await supabase
    .from("carers")
    .select("id, name, full_name, email, phone, role, active")
    .eq("agency_id", agencyId)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const data = (raw ?? []).map((c) => {
    const d = c as { full_name?: string; name?: string } & Record<string, unknown>;
    return { ...d, name: d.full_name ?? d.name ?? null };
  });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const name = (body.name as string)?.trim();
  const email = (body.email as string)?.trim() || null;
  const phone = (body.phone as string)?.trim() || null;
  const role = (body.role as string)?.trim() || null;
  const active = body.active !== false;

  if (!name) {
    return NextResponse.json(
      { error: "Name is required" },
      { status: 400 }
    );
  }

  if (email && !isValidEmail(email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("insert_carer", {
    p_agency_id: agencyId,
    p_name: name,
    p_email: email,
    p_phone: phone,
    p_role: role,
    p_active: active,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as Record<string, unknown>);
}
