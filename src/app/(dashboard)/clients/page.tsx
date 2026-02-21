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
    funding_type?: string;
    latitude?: number | null;
    longitude?: number | null;
  };

  const clients: ClientRow[] = Array.isArray(raw) ? raw : [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
      {fetchError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          Error loading clients: {fetchError.message}
        </p>
      ) : null}
      <ClientsList clients={clients} />
    </div>
  );
}
