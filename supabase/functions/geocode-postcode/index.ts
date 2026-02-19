import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const POSTCODES_IO = "https://api.postcodes.io/postcodes";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, content-type, apikey, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { client_id, postcode } = await req.json();
  if (!client_id || !postcode) {
    return Response.json(
      { error: "client_id and postcode required" },
      { status: 400 }
    );
  }

  // Get user's agency
  const { data: membership } = await supabase
    .from("agency_members")
    .select("agency_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return Response.json(
      { error: "No agency membership" },
      { status: 403 }
    );
  }

  const agencyId = membership.agency_id;

  // Verify client via security-definer RPC (avoids RLS recursion)
  const { data: client, error: clientErr } = await supabase
    .rpc("get_client_postcode", {
      p_client_id: client_id,
      p_agency_id: agencyId,
    })
    .maybeSingle();

  if (clientErr || !client) {
    return Response.json(
      { error: clientErr?.message ?? "Client not found" },
      { status: 404 }
    );
  }

  // Normalize UK postcode
  const raw = postcode.trim().replace(/\s+/g, "").toUpperCase();
  const normalized =
    raw.length >= 5 ? raw.slice(0, -3) + " " + raw.slice(-3) : raw;

  const encoded = encodeURIComponent(normalized);
  const res = await fetch(`${POSTCODES_IO}/${encoded}`);
  if (!res.ok) {
    return Response.json({ ok: false, error: "Postcode lookup failed" });
  }

  const data = await res.json();
  if (data.status !== 200 || !data.result) {
    return Response.json({
      ok: false,
      error: `Postcode "${normalized}" not found`,
    });
  }

  const { latitude, longitude } = data.result;

  // Update via security-definer RPC (avoids RLS recursion)
  const { data: updated, error: updateError } = await supabase.rpc(
    "update_client_geocode",
    {
      p_client_id: client_id,
      p_agency_id: agencyId,
      p_latitude: latitude,
      p_longitude: longitude,
    }
  );

  if (updateError) {
    return Response.json({ ok: false, error: updateError.message });
  }

  if (!updated) {
    return Response.json({ ok: false, error: "Client update returned no rows" });
  }

  return Response.json(
    { ok: true, latitude, longitude },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    }
  );
});
