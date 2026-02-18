import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import { CarersPageClient } from "./carers-page-client";

export default async function CarersPage() {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return null;

  const supabase = await createClient();
  const { data: raw, error: fetchError } = await supabase.rpc(
    "list_carers",
    { p_agency_id: agencyId }
  );

  const carers = Array.isArray(raw) ? raw : [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Carers</h1>
      {fetchError ? (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Error loading carers: {fetchError.message}
        </p>
      ) : null}
      <CarersPageClient initialCarers={carers} />
    </div>
  );
}
