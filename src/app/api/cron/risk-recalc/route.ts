import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = authHeader?.replace("Bearer ", "") ?? request.headers.get("x-cron-secret");

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const toDate = nextWeek.toISOString().slice(0, 10);

  const { data: visits } = await supabase
    .from("visits")
    .select("id")
    .gte("start_time", `${today}T00:00:00`)
    .lte("start_time", `${toDate}T23:59:59`);

  if (!visits?.length) {
    return NextResponse.json({ ok: true, message: "No visits in range", count: 0 });
  }

  let count = 0;
  for (const { id } of visits) {
    const { error } = await supabase.rpc("calculate_visit_risk", { p_visit_id: id });
    if (!error) count++;
  }

  return NextResponse.json({ ok: true, count });
}
