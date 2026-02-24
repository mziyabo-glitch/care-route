import { createClient } from "@/lib/supabase/server";
import { VisitsPageClient } from "./visits-page-client";
import { getCurrentAgencyId } from "@/lib/agency";
import { getCurrentRole } from "@/lib/permissions";

export default async function VisitsPage() {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return null;

  const supabase = await createClient();
  const [
    { data: visitsRaw, error: visitsError },
    { data: clientsRaw },
    { data: carersRaw },
    { role },
  ] = await Promise.all([
    supabase.rpc("list_visits", { p_agency_id: agencyId }),
    supabase.rpc("list_clients_for_selection", { p_agency_id: agencyId }),
    supabase.rpc("list_carers_for_selection", { p_agency_id: agencyId }),
    getCurrentRole(),
  ]);

  const visits = Array.isArray(visitsRaw) ? visitsRaw : [];
  const clients = Array.isArray(clientsRaw) ? clientsRaw : [];
  const carers = Array.isArray(carersRaw) ? carersRaw : [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-900">Visits</h1>
      {visitsError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          Error loading visits: {visitsError.message}
        </p>
      ) : null}
      <VisitsPageClient
        agencyId={agencyId}
        initialVisits={visits}
        clients={clients}
        carers={carers}
        userRole={role}
      />
    </div>
  );
}
