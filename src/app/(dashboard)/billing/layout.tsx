import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/permissions";

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

  return <>{children}</>;
}
