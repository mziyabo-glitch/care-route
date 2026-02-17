import { createClient } from "@/lib/supabase/server";
import { CarersList } from "./carers-list";

export default async function CarersPage() {
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

  const { data: carers } = await supabase
    .from("carers")
    .select("id, name, email, phone")
    .eq("agency_id", membership.agency_id)
    .order("name");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Carers</h1>
      </div>
      <CarersList agencyId={membership.agency_id} carers={carers ?? []} />
    </div>
  );
}
