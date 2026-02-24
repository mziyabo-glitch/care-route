import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in", { p_visit_id: id });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
