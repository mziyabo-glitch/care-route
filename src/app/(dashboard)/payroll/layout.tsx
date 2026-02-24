import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/permissions";

export default async function PayrollLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role } = await getCurrentRole();
  if (role !== "owner" && role !== "admin") {
    redirect("/dashboard");
  }

  return <div className="space-y-6">{children}</div>;
}
