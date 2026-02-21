import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";

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
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    updates.name = name;
    updates.full_name = name;
  }
  if (body.address !== undefined) updates.address = (body.address as string)?.trim() || null;
  if (body.postcode !== undefined) updates.postcode = (body.postcode as string)?.trim() || null;
  if (body.notes !== undefined) updates.notes = (body.notes as string)?.trim() || null;
  if (body.requires_double_up !== undefined) updates.requires_double_up = !!body.requires_double_up;
  if (body.funding_type !== undefined) {
    const ft = (body.funding_type as string)?.trim();
    if (ft && ft !== "private" && ft !== "local_authority") {
      return NextResponse.json({ error: "Invalid funding_type" }, { status: 400 });
    }
    updates.funding_type = ft || "private";
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update(updates)
    .eq("id", id)
    .eq("agency_id", agencyId)
    .select("id, name, address, postcode, notes, requires_double_up, funding_type")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  const { error } = await supabase.rpc("archive_client", { p_client_id: id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
