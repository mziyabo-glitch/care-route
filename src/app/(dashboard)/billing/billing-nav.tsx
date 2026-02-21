"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function BillingNav() {
  const pathname = usePathname();
  const link = "rounded-lg px-3 py-2 text-sm font-medium transition";
  const active = "bg-slate-200 text-slate-900";
  const inactive = "text-slate-600 hover:bg-slate-100 hover:text-slate-800";

  return (
    <nav className="flex gap-1 border-b border-slate-200 pb-4" aria-label="Billing">
      <Link
        href="/billing/summary"
        className={`${link} ${pathname.startsWith("/billing/summary") ? active : inactive}`}
      >
        Summary
      </Link>
      <Link
        href="/billing/setup"
        className={`${link} ${pathname.startsWith("/billing/setup") ? active : inactive}`}
      >
        Setup
      </Link>
    </nav>
  );
}
