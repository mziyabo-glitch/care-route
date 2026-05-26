import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import {
  canAccessCompliance,
  canAccessVisitMap,
  getCurrentRole,
} from "@/lib/permissions";
import { DashboardNav } from "@/app/components/dashboard-nav";
import { LogoutButton } from "@/app/(dashboard)/dashboard/logout-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    redirect("/onboarding");
  }

  const { role } = await getCurrentRole();
  const canAccessBilling = role === "owner" || role === "admin" || role === "manager";
  const canAccessPayroll = role === "owner" || role === "admin";
  const showVisitMap = canAccessVisitMap(role);
  const showCompliance = canAccessCompliance(role);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
          <DashboardNav
            canAccessBilling={canAccessBilling}
            canAccessPayroll={canAccessPayroll}
            canAccessVisitMap={showVisitMap}
            canAccessCompliance={showCompliance}
          />
          <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-4">
            <span className="text-sm text-slate-500">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
