import { createClient } from "@/lib/supabase/server";
import { ClientsList } from "./clients-list";
import { getCurrentAgencyId } from "@/lib/agency";

export default async function ClientsPage() {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return null;

  const supabase = await createClient();

  const { data: raw } = await supabase
    .from("clients")
    .select("id, name, full_name, address, postcode, notes")
    .eq("agency_id", agencyId)
    .order("name");

  const clients = (raw ?? []).map((c) => ({
    ...c,
    name:
      (c as { full_name?: string; name?: string }).full_name ??
      (c as { full_name?: string; name?: string }).name ??
      null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
      </div>
      <ClientsList clients={clients ?? []} />
    </div>
  );
}
