import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const POSTCODES_IO = "https://api.postcodes.io/postcodes";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_id, postcode } = body;

    if (!client_id || !postcode?.trim()) {
      return NextResponse.json(
        { ok: false, error: "client_id and postcode required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { data: membership } = await supabase
      .from("agency_members")
      .select("agency_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        { ok: false, error: "No agency membership" },
        { status: 403 }
      );
    }

    const agencyId = membership.agency_id;

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, agency_id")
      .eq("id", client_id)
      .eq("agency_id", agencyId)
      .maybeSingle();

    if (clientError) {
      return NextResponse.json(
        { ok: false, error: `Client lookup failed: ${clientError.message}` },
        { status: 500 }
      );
    }

    if (!client) {
      return NextResponse.json(
        { ok: false, error: "Client not found in agency" },
        { status: 404 }
      );
    }

    // Normalize UK postcode: uppercase, strip spaces, re-insert space before last 3 chars
    const raw = postcode.trim().replace(/\s+/g, "").toUpperCase();
    const normalized =
      raw.length >= 5 ? raw.slice(0, -3) + " " + raw.slice(-3) : raw;

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
      return NextResponse.json({
        ok: false,
        error: "Postcode lookup timed out",
      });
    }

    if (latitude == null || longitude == null) {
      return NextResponse.json({
        ok: false,
        error: `Postcode "${normalized}" not found on Postcodes.io`,
      });
    }

    const { error: updateError } = await supabase
      .from("clients")
      .update({ latitude, longitude })
      .eq("id", client_id);

    if (updateError) {
      return NextResponse.json({
        ok: false,
        error: `DB update failed: ${updateError.message}`,
      });
    }

    // Invalidate travel_cache entries involving this client
    await supabase
      .from("travel_cache")
      .delete()
      .eq("agency_id", agencyId)
      .or(`from_client_id.eq.${client_id},to_client_id.eq.${client_id}`);

    return NextResponse.json({ ok: true, latitude, longitude });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Unexpected: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
