import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const POSTCODES_IO = "https://api.postcodes.io/postcodes";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { client_id, postcode } = await req.json();
  if (!client_id || !postcode) {
    return Response.json({ error: "client_id and postcode required" }, { status: 400 });
  }

  // Verify user belongs to the client's agency
  const { data: client } = await supabase
    .from("clients")
    .select("id, agency_id")
    .eq("id", client_id)
    .maybeSingle();

  if (!client) {
    return Response.json({ error: "Client not found" }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("agency_members")
    .select("id")
    .eq("agency_id", client.agency_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return Response.json({ error: "Not authorized for this agency" }, { status: 403 });
  }

  // Call Postcodes.io
  const encoded = encodeURIComponent(postcode.trim());
  const res = await fetch(`${POSTCODES_IO}/${encoded}`);
  if (!res.ok) {
    return Response.json({ ok: false, error: "Postcode lookup failed" }, { status: 200 });
  }

  const data = await res.json();
  if (data.status !== 200 || !data.result) {
    return Response.json({ ok: false, error: "Postcode not found" }, { status: 200 });
  }

  const { latitude, longitude } = data.result;

  // Update client with lat/lng
  const { error: updateError } = await supabase
    .from("clients")
    .update({ latitude, longitude })
    .eq("id", client_id);

  if (updateError) {
    return Response.json({ ok: false, error: updateError.message }, { status: 200 });
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
