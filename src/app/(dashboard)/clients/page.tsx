import { createClient } from "@/lib/supabase/server";
import { ClientsList } from "./clients-list";
import { getCurrentAgencyId } from "@/lib/agency";

export default async function ClientsPage() {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return null;

  const supabase = await createClient();

  // Use select("*") to avoid PostgREST schema-cache column resolution issues.
  const { data: raw, error: fetchError } = await supabase
    .from("clients")
    .select("*")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });

  const clients = (raw ?? []).map((c) => {
    const row = c as Record<string, unknown>;
    return {
      id: row.id as string,
      name: ((row.full_name ?? row.name) as string | null) ?? null,
      address: (row.address as string | null) ?? null,
      postcode: (row.postcode as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
      </div>
      {fetchError ? (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Error loading clients: {fetchError.message}
        </p>
      ) : null}
      <ClientsList clients={clients} />
    </div>
  );
}
