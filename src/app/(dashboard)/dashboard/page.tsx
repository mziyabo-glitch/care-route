import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import { getCurrentRole } from "@/lib/permissions";
import { loadDashboardData } from "@/lib/dashboard-data";
import { DashboardView } from "./dashboard-view";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return null;

  const { role } = await getCurrentRole();

  const data = await loadDashboardData(supabase, agencyId, {
    user: {
      email: user.email,
      user_metadata: user.user_metadata as Record<string, unknown>,
    },
    role,
  });

  return <DashboardView data={data} />;
}
