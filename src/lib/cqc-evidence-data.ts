import type { SupabaseClient } from "@supabase/supabase-js";

export const CQC_CATEGORIES = [
  "safe",
  "effective",
  "caring",
  "responsive",
  "well_led",
] as const;

export type CqcCategory = (typeof CQC_CATEGORIES)[number];
export type CqcEvidenceStatus = "open" | "in_review" | "complete";
export type CqcRiskLevel = "low" | "medium" | "high";

export type CqcEvidenceRow = {
  id: string;
  agency_id: string;
  category: CqcCategory;
  title: string;
  description: string;
  client_id: string | null;
  visit_id: string | null;
  care_plan_id: string | null;
  status: CqcEvidenceStatus;
  risk: CqcRiskLevel;
  due_date: string | null;
  owner: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const CQC_CATEGORY_LABELS: Record<CqcCategory, string> = {
  safe: "Safe",
  effective: "Effective",
  caring: "Caring",
  responsive: "Responsive",
  well_led: "Well-led",
};

export function isOverdueDueDate(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

export async function loadCqcEvidenceForAgency(
  supabase: SupabaseClient,
  agencyId: string
): Promise<CqcEvidenceRow[]> {
  const { data, error } = await supabase
    .from("cqc_evidence_items")
    .select("*")
    .eq("agency_id", agencyId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CqcEvidenceRow[];
}

export type CqcEvidenceSummary = {
  by_category: Record<
    CqcCategory,
    { open: number; overdue: number; high_risk_open: number }
  >;
  overdue_count: number;
  high_risk_open_count: number;
  open_count: number;
  recently_completed: CqcEvidenceRow[];
};

export function summariseCqcEvidence(items: CqcEvidenceRow[]): CqcEvidenceSummary {
  const by_category = Object.fromEntries(
    CQC_CATEGORIES.map((c) => [c, { open: 0, overdue: 0, high_risk_open: 0 }])
  ) as CqcEvidenceSummary["by_category"];

  let overdue_count = 0;
  let high_risk_open_count = 0;
  let open_count = 0;

  for (const item of items) {
    const isOpen = item.status !== "complete";
    const overdue = isOpen && isOverdueDueDate(item.due_date);
    const highOpen = isOpen && item.risk === "high";

    if (isOpen) {
      open_count += 1;
      by_category[item.category].open += 1;
    }
    if (overdue) {
      overdue_count += 1;
      by_category[item.category].overdue += 1;
    }
    if (highOpen) {
      high_risk_open_count += 1;
      by_category[item.category].high_risk_open += 1;
    }
  }

  const recently_completed = items
    .filter((i) => i.status === "complete")
    .slice(0, 8);

  return {
    by_category,
    overdue_count,
    high_risk_open_count,
    open_count,
    recently_completed,
  };
}

export async function createCqcEvidenceItem(
  supabase: SupabaseClient,
  agencyId: string,
  userId: string,
  input: {
    category: CqcCategory;
    title: string;
    description?: string;
    client_id?: string | null;
    visit_id?: string | null;
    care_plan_id?: string | null;
    status?: CqcEvidenceStatus;
    risk?: CqcRiskLevel;
    due_date?: string | null;
    owner?: string | null;
  }
): Promise<CqcEvidenceRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("cqc_evidence_items")
    .insert({
      agency_id: agencyId,
      category: input.category,
      title: input.title.trim(),
      description: (input.description ?? "").trim(),
      client_id: input.client_id ?? null,
      visit_id: input.visit_id ?? null,
      care_plan_id: input.care_plan_id ?? null,
      status: input.status ?? "open",
      risk: input.risk ?? "low",
      due_date: input.due_date ?? null,
      owner: input.owner?.trim() || null,
      created_by: userId,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as CqcEvidenceRow;
}

export async function updateCqcEvidenceItem(
  supabase: SupabaseClient,
  agencyId: string,
  id: string,
  updates: Partial<{
    category: CqcCategory;
    title: string;
    description: string;
    client_id: string | null;
    visit_id: string | null;
    care_plan_id: string | null;
    status: CqcEvidenceStatus;
    risk: CqcRiskLevel;
    due_date: string | null;
    owner: string | null;
  }>
): Promise<CqcEvidenceRow> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.title !== undefined) payload.title = updates.title.trim();
  if (updates.description !== undefined) payload.description = updates.description.trim();
  if (updates.client_id !== undefined) payload.client_id = updates.client_id;
  if (updates.visit_id !== undefined) payload.visit_id = updates.visit_id;
  if (updates.care_plan_id !== undefined) payload.care_plan_id = updates.care_plan_id;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.risk !== undefined) payload.risk = updates.risk;
  if (updates.due_date !== undefined) payload.due_date = updates.due_date;
  if (updates.owner !== undefined) payload.owner = updates.owner?.trim() || null;

  const { data, error } = await supabase
    .from("cqc_evidence_items")
    .update(payload)
    .eq("id", id)
    .eq("agency_id", agencyId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as CqcEvidenceRow;
}
