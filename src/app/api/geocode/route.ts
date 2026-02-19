import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";

const POSTCODES_IO = "https://api.postcodes.io/postcodes";

export async function POST(request: Request) {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { client_id, postcode } = body;

  if (!client_id || !postcode?.trim()) {
    return NextResponse.json(
      { error: "client_id and postcode required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Verify client belongs to user's agency
  const { data: client } = await supabase
    .from("clients")
    .select("id, agency_id")
    .eq("id", client_id)
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Normalize: uppercase, strip spaces, re-insert space before last 3 chars (UK postcode format)
  const raw = postcode.trim().replace(/\s+/g, "").toUpperCase();
  const normalized = raw.length >= 5
    ? raw.slice(0, -3) + " " + raw.slice(-3)
    : raw;

  const encoded = encodeURIComponent(normalized);
  let latitude: number | null = null;
  let longitude: number | null = null;

  try {
    const res = await fetch(`${POSTCODES_IO}/${encoded}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.status === 200 && data.result) {
        latitude = data.result.latitude;
        longitude = data.result.longitude;
      }
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Postcode lookup timed out" });
  }

  if (latitude == null || longitude == null) {
    return NextResponse.json({ ok: false, error: "Postcode not found" });
  }

  // Update client with lat/lng
  const { error: updateError } = await supabase
    .from("clients")
    .update({ latitude, longitude })
    .eq("id", client_id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message });
  }

  // Invalidate travel_cache entries for this client
  await supabase
    .from("travel_cache")
    .delete()
    .eq("agency_id", agencyId)
    .or(`from_client_id.eq.${client_id},to_client_id.eq.${client_id}`);

  return NextResponse.json({ ok: true, latitude, longitude });
}
