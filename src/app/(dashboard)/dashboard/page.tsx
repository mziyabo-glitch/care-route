import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
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

  const { data: agency } = await supabase
    .from("agencies")
    .select("name")
    .eq("id", agencyId)
    .single();

  const [{ count: clientsCount }, { count: carersCount }, { count: visitsCount }] =
    await Promise.all([
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
      supabase.from("carers").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
      supabase.from("visits").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
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
        </Link>
      </div>
    </div>
  );
}
