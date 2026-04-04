import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import { CarePlanPageClient } from "./care-plan-page-client";

export default async function ClientCarePlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, full_name")
    .eq("id", id)
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (!client) {
    notFound();
  }

  const row = client as { full_name?: string | null; name?: string | null };
  const displayName =
    (row.full_name && row.full_name.trim()) ||
    (row.name && row.name.trim()) ||
    "Client";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/clients"
          className="text-sm font-medium text-blue-600 transition hover:text-blue-500"
        >
          ← Back to clients
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-slate-900">
        Care plan — {displayName}
      </h1>
      <CarePlanPageClient clientId={id} />
    </div>
  );
}
