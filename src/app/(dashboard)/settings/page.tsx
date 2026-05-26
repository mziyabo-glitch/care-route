import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgency } from "@/lib/agency";
import { canEdit, getCurrentRole } from "@/lib/permissions";
import { getDisplayNameFromMetadata } from "@/lib/user-display-name";
import { SettingsPageClient } from "./settings-page-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const agency = await getCurrentAgency();
  if (!agency) redirect("/onboarding");

  const { role } = await getCurrentRole();

  return (
    <SettingsPageClient
      email={user.email ?? ""}
      displayName={getDisplayNameFromMetadata(
        user.user_metadata as Record<string, unknown>
      )}
      agencyName={agency.name}
      role={role}
      canEditAgency={canEdit(role)}
    />
  );
}
