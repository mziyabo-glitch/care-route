import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/permissions";

export default async function VisitMapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role } = await getCurrentRole();
  const canAccess =
    role === "owner" || role === "admin" || role === "manager";

  if (!canAccess) {
    redirect("/dashboard");
  }

  return <div className="space-y-6">{children}</div>;
}
