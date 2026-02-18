import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import { CarersPageClient } from "./carers-page-client";

export default async function CarersPage() {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return null;

  const supabase = await createClient();
  const { data: carers } = await supabase
    .from("carers")
    .select("id, name, email, phone, role, active")
    .eq("agency_id", agencyId)
    .order("name");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Carers</h1>
      <CarersPageClient initialCarers={carers ?? []} />
    </div>
  );
}
