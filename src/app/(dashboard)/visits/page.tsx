import { createClient } from "@/lib/supabase/server";
import { VisitsList } from "./visits-list";

export default async function VisitsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: membership } = await supabase
    .from("agency_members")
    .select("agency_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const agencyId = membership.agency_id;

  const [{ data: visits }, { data: clients }, { data: carers }] =
    await Promise.all([
      supabase
        .from("visits")
        .select("id, scheduled_at, status, notes, client_id, carer_id")
        .eq("agency_id", agencyId)
        .order("scheduled_at", { ascending: false }),
      supabase
        .from("clients")
        .select("id, name")
        .eq("agency_id", agencyId)
        .order("name"),
      supabase
        .from("carers")
        .select("id, name, full_name")
        .eq("agency_id", agencyId)
        .eq("active", true)
        .order("name"),
    ]);

  const carersWithName = (carers ?? []).map((c) => ({
    ...c,
    name: (c as { full_name?: string; name?: string }).full_name ?? (c as { full_name?: string; name?: string }).name ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Visits</h1>
      </div>
      <VisitsList
        agencyId={agencyId}
        visits={visits ?? []}
        clients={clients ?? []}
        carers={carersWithName}
      />
    </div>
  );
}
