"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DashboardNav({ canAccessBilling = false, canAccessPayroll = false }: { canAccessBilling?: boolean; canAccessPayroll?: boolean }) {
  const pathname = usePathname();
  const link = "rounded-lg px-4 py-2 text-sm font-medium transition-colors";
  const activeLink = "bg-slate-100 text-slate-900";
  const inactiveLink = "text-slate-600 hover:bg-slate-50 hover:text-slate-900";

  return (
    <nav className="flex gap-1" aria-label="Main">
      <Link
        href="/dashboard"
        className={`${link} ${pathname === "/dashboard" ? activeLink : inactiveLink}`}
      >
        Dashboard
      </Link>
      <Link
        href="/clients"
        className={`${link} ${pathname.startsWith("/clients") ? activeLink : inactiveLink}`}
      >
        Clients
      </Link>
      <Link
        href="/carers"
        className={`${link} ${pathname.startsWith("/carers") ? activeLink : inactiveLink}`}
      >
        Carers
      </Link>
      <Link
        href="/visits"
        className={`${link} ${pathname.startsWith("/visits") ? activeLink : inactiveLink}`}
      >
        Visits
      </Link>
      <Link
        href="/rota"
        className={`${link} ${pathname.startsWith("/rota") ? activeLink : inactiveLink}`}
      >
        Rota
      </Link>
      {canAccessBilling && (
        <Link
          href="/billing"
          className={`${link} ${pathname.startsWith("/billing") ? activeLink : inactiveLink}`}
        >
          Billing
        </Link>
      )}
      {canAccessPayroll && (
        <Link
          href="/payroll"
          className={`${link} ${pathname.startsWith("/payroll") ? activeLink : inactiveLink}`}
        >
          Payroll
        </Link>
      )}
      <Link
        href="/settings/members"
        className={`${link} ${pathname.startsWith("/settings") ? activeLink : inactiveLink}`}
      >
        Settings
      </Link>
    </nav>
  );
}
