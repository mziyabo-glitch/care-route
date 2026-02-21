import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/permissions";
import { BillingNav } from "./billing-nav";

export default async function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role } = await getCurrentRole();
  const canAccess = role === "owner" || role === "admin" || role === "manager";

  if (!canAccess) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <BillingNav />
      {children}
    </div>
  );
}
