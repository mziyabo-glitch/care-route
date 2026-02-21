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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_client", {
    p_client_id: id,
    p_name: body.name !== undefined ? (body.name as string) : null,
    p_address: body.address !== undefined ? (body.address as string) : null,
    p_postcode: body.postcode !== undefined ? (body.postcode as string) : null,
    p_notes: body.notes !== undefined ? (body.notes as string) : null,
    p_requires_double_up: body.requires_double_up !== undefined ? !!body.requires_double_up : null,
    p_funding_type: body.funding_type !== undefined ? (body.funding_type as string) : null,
  });

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
