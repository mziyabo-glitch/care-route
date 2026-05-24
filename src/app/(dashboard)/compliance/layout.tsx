import { redirect } from "next/navigation";
import { canAccessCompliance, getCurrentRole } from "@/lib/permissions";

export default async function ComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role } = await getCurrentRole();

  if (!canAccessCompliance(role)) {
    redirect("/dashboard");
  }

  return <div className="space-y-6">{children}</div>;
}
