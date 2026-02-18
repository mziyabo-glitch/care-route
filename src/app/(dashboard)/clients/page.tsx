import { createClient } from "@/lib/supabase/server";
import { ClientsList } from "./clients-list";
import { getCurrentAgencyId } from "@/lib/agency";

export default async function ClientsPage() {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return null;

  const supabase = await createClient();

  const { data: raw, error: fetchError } = await supabase.rpc(
    "list_clients",
    { p_agency_id: agencyId }
  );

  type ClientRow = {
    id: string;
    name: string | null;
    address: string | null;
    postcode: string | null;
    notes: string | null;
    requires_double_up?: boolean;
  };

  const clients: ClientRow[] = Array.isArray(raw) ? raw : [];

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
