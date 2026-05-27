import type { SupabaseClient } from "@supabase/supabase-js";

export type ConfidentialityLevel = "standard" | "restricted";

export type CarePlanRow = {
  id: string;
  agency_id: string;
  client_id: string;
  status: string;
  version: number;
  effective_from: string | null;
  effective_to: string | null;
  review_due_date: string | null;
  last_reviewed_at: string | null;
  last_reviewed_by: string | null;
  confidentiality_level: ConfidentialityLevel;
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
  confidentiality_level: ConfidentialityLevel;
  created_at: string;
  updated_at: string;
};

/** Default domiciliary care plan sections created on POST. */
export const DEFAULT_CARE_PLAN_SECTION_TEMPLATES: ReadonlyArray<{
  section_key: string;
  title: string;
  sort_order: number;
  confidentiality_level?: ConfidentialityLevel;
}> = [
  { section_key: "personal_details", title: "Personal details / preferred name", sort_order: 0 },
  { section_key: "important_contacts", title: "Important contacts", sort_order: 1 },
  { section_key: "medical_conditions", title: "Medical conditions", sort_order: 2 },
  { section_key: "medication_support", title: "Medication support notes", sort_order: 3 },
  { section_key: "mobility", title: "Mobility", sort_order: 4 },
  { section_key: "personal_care", title: "Personal care", sort_order: 5 },
  { section_key: "nutrition_hydration", title: "Nutrition and hydration", sort_order: 6 },
  { section_key: "communication_needs", title: "Communication needs", sort_order: 7 },
  { section_key: "risks_hazards", title: "Risks and hazards", sort_order: 8 },
  { section_key: "preferences_routines", title: "Preferences and routines", sort_order: 9 },
  { section_key: "emergency_instructions", title: "Emergency instructions", sort_order: 10 },
  {
    section_key: "confidential_notes",
    title: "Confidential notes",
    sort_order: 11,
    confidentiality_level: "restricted",
  },
];

export function isCarePlanReviewOverdue(plan: CarePlanRow): boolean {
  if (plan.status === "archived" || !plan.review_due_date) return false;
  const today = new Date().toISOString().slice(0, 10);
  return plan.review_due_date < today;
}

export type OverdueCarePlanReview = {
  id: string;
  client_id: string;
  client_name: string;
  review_due_date: string;
  status: string;
};

export async function loadOverdueCarePlanReviews(
  supabase: SupabaseClient,
  agencyId: string
): Promise<OverdueCarePlanReview[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: plans, error } = await supabase
    .from("care_plans")
    .select("id, client_id, review_due_date, status")
    .eq("agency_id", agencyId)
    .in("status", ["draft", "active"])
    .not("review_due_date", "is", null)
    .lt("review_due_date", today);

  if (error) throw new Error(error.message);
  if (!plans?.length) return [];

  const clientIds = [...new Set(plans.map((p) => p.client_id as string))];
  const { data: clients, error: clientErr } = await supabase
    .from("clients")
    .select("id, full_name, name")
    .eq("agency_id", agencyId)
    .in("id", clientIds);

  if (clientErr) throw new Error(clientErr.message);

  const nameById = new Map<string, string>();
  for (const c of clients ?? []) {
    nameById.set(c.id as string, (c.full_name as string) || (c.name as string) || "Unknown client");
  }

  return plans.map((p) => ({
    id: p.id as string,
    client_id: p.client_id as string,
    client_name: nameById.get(p.client_id as string) ?? "Unknown client",
    review_due_date: p.review_due_date as string,
    status: p.status as string,
  }));
}

function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type CarePlanReviewStats = {
  overdue: number;
  dueThisWeek: number;
  upToDate: number;
  topOverdue: OverdueCarePlanReview[];
};

/** Active/draft plans with a review due date — counts only, no plan body text. */
export async function loadCarePlanReviewStats(
  supabase: SupabaseClient,
  agencyId: string,
  today: string
): Promise<CarePlanReviewStats> {
  const weekEnd = addDaysIso(today, 6);

  const { data: plans, error } = await supabase
    .from("care_plans")
    .select("id, client_id, review_due_date, status")
    .eq("agency_id", agencyId)
    .in("status", ["draft", "active"])
    .not("review_due_date", "is", null);

  if (error) throw new Error(error.message);
  if (!plans?.length) {
    return { overdue: 0, dueThisWeek: 0, upToDate: 0, topOverdue: [] };
  }

  let overdue = 0;
  let dueThisWeek = 0;
  let upToDate = 0;

  for (const p of plans) {
    const due = p.review_due_date as string;
    if (due < today) overdue += 1;
    else if (due <= weekEnd) dueThisWeek += 1;
    else upToDate += 1;
  }

  const topOverdue = await loadOverdueCarePlanReviews(supabase, agencyId);
  topOverdue.sort((a, b) => a.review_due_date.localeCompare(b.review_due_date));

  return {
    overdue,
    dueThisWeek,
    upToDate,
    topOverdue: topOverdue.slice(0, 3),
  };
}

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
  const pool = plans.filter((p) => p.status !== "archived");
  if (!pool.length) return null;
  const active = pool.find((p) => p.status === "active");
  if (active) return active;
  return [...pool].sort(
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

export async function loadArchivedCarePlans(
  supabase: SupabaseClient,
  agencyId: string,
  clientId: string
): Promise<CarePlanRow[]> {
  const { data, error } = await supabase
    .from("care_plans")
    .select("*")
    .eq("client_id", clientId)
    .eq("agency_id", agencyId)
    .eq("status", "archived")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CarePlanRow[];
}

export async function loadCarePlanSections(
  supabase: SupabaseClient,
  agencyId: string,
  carePlanId: string
): Promise<CarePlanSectionRow[]> {
  const { data, error } = await supabase
    .from("care_plan_sections")
    .select("*")
    .eq("care_plan_id", carePlanId)
    .eq("agency_id", agencyId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as CarePlanSectionRow[];
}
