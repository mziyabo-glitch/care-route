import type { SupabaseClient } from "@supabase/supabase-js";

export type CarePlanRow = {
  id: string;
  agency_id: string;
  client_id: string;
  status: string;
  version: number;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type CarePlanSectionRow = {
  id: string;
  agency_id: string;
  care_plan_id: string;
  sort_order: number;
  title: string;
  body: string;
  section_key: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Server-only: confirms the client row exists under the resolved agency (never trust client agency_id).
 */
export async function verifyClientBelongsToAgency(
  supabase: SupabaseClient,
  clientId: string,
  agencyId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("agency_id", agencyId)
    .maybeSingle();
  return !!data;
}

/**
 * Pick a single plan to show: active (at most one), else most recently updated non-archived, else most recent overall.
 */
export function pickDisplayCarePlan(plans: CarePlanRow[]): CarePlanRow | null {
  if (!plans.length) return null;
  const active = plans.find((p) => p.status === "active");
  if (active) return active;
  const pool = plans.filter((p) => p.status !== "archived");
  const list = pool.length ? pool : plans;
  return [...list].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )[0] ?? null;
}

export async function loadCarePlanBundle(
  supabase: SupabaseClient,
  agencyId: string,
  clientId: string
): Promise<{ plan: CarePlanRow | null; sections: CarePlanSectionRow[] }> {
  const { data: plans, error } = await supabase
    .from("care_plans")
    .select("*")
    .eq("client_id", clientId)
    .eq("agency_id", agencyId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (plans ?? []) as CarePlanRow[];
  const plan = pickDisplayCarePlan(rows);
  if (!plan) {
    return { plan: null, sections: [] };
  }

  const { data: secs, error: secErr } = await supabase
    .from("care_plan_sections")
    .select("*")
    .eq("care_plan_id", plan.id)
    .eq("agency_id", agencyId)
    .order("sort_order", { ascending: true });

  if (secErr) throw new Error(secErr.message);
  return { plan, sections: (secs ?? []) as CarePlanSectionRow[] };
}

export async function getCarePlanByIdForClient(
  supabase: SupabaseClient,
  agencyId: string,
  planId: string,
  clientId: string
): Promise<CarePlanRow | null> {
  const { data, error } = await supabase
    .from("care_plans")
    .select("*")
    .eq("id", planId)
    .eq("agency_id", agencyId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) return null;
  return (data as CarePlanRow) ?? null;
}
