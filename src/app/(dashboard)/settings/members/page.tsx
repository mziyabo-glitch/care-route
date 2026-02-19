import { getCurrentRole } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { MembersPageClient } from "./members-page-client";

export default async function MembersPage() {
  const { agencyId, role } = await getCurrentRole();
  if (!agencyId) redirect("/login");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-900">
          Team &amp; Members
        </h1>
      <MembersPageClient myRole={role ?? "viewer"} />
    </div>
  );
}
