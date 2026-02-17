import { createClient } from "@/lib/supabase/server";
import { ClientsList } from "./clients-list";

export default async function ClientsPage() {
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

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, address, postcode, notes")
    .eq("agency_id", membership.agency_id)
    .order("name");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
      </div>
      <ClientsList
        agencyId={membership.agency_id}
        clients={clients ?? []}
      />
    </div>
  );
}
