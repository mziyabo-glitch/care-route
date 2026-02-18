import { getCurrentRole } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { MembersPageClient } from "./members-page-client";

export default async function MembersPage() {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId) redirect("/login");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">
          Team &amp; Members
        </h1>
      </div>
      <MembersPageClient myRole={role ?? "viewer"} />
    </div>
  );
}
