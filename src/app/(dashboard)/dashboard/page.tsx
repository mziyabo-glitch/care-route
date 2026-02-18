import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return null;

  const { data: agency } = await supabase
    .from("agencies")
    .select("name")
    .eq("id", agencyId)
    .single();

  const [
    { data: clientsCount },
    { data: carersCount },
    { data: visitsCount },
    { data: visitsTodayCount },
  ] = await Promise.all([
    supabase.rpc("count_clients", { p_agency_id: agencyId }),
    supabase.rpc("count_carers", { p_agency_id: agencyId }),
    supabase.rpc("count_visits", { p_agency_id: agencyId }),
    supabase.rpc("count_visits_today", { p_agency_id: agencyId }),
  ]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Agency</h1>
        <p className="mt-2 text-2xl font-medium text-gray-900">
          {agency?.name ?? "Your agency"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/clients"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gray-300 hover:shadow-md"
        >
          <h2 className="text-sm font-medium text-gray-500">Clients</h2>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{clientsCount ?? 0}</p>
        </Link>
        <Link
          href="/carers"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gray-300 hover:shadow-md"
        >
          <h2 className="text-sm font-medium text-gray-500">Carers</h2>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{carersCount ?? 0}</p>
        </Link>
        <Link
          href="/visits"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gray-300 hover:shadow-md"
        >
          <h2 className="text-sm font-medium text-gray-500">Visits</h2>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{visitsCount ?? 0}</p>
          <p className="mt-1 text-xs text-gray-500">
            {visitsTodayCount ?? 0} today
          </p>
        </Link>
      </div>
    </div>
  );
}
