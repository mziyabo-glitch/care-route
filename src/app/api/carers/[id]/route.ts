import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = (body.name as string)?.trim();
    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }
    updates.name = name;
  }
  if (body.email !== undefined) {
    const email = (body.email as string)?.trim() || null;
    if (email && !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }
    updates.email = email;
  }
  if (body.phone !== undefined) {
    updates.phone = (body.phone as string)?.trim() || null;
  }
  if (body.role !== undefined) {
    updates.role = (body.role as string)?.trim() || null;
  }
  if (body.active !== undefined) {
    updates.active = !!body.active;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("carers")
    .update(updates)
    .eq("id", id)
    .eq("agency_id", agencyId)
    .select("id, name, email, phone, role, active")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createClient();

  // Soft delete: set active = false
  const { data, error } = await supabase
    .from("carers")
    .update({ active: false })
    .eq("id", id)
    .eq("agency_id", agencyId)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
