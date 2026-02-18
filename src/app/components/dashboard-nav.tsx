"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DashboardNav() {
  const pathname = usePathname();
  const link =
    "rounded-md px-3 py-2 text-sm font-medium transition-colors";
  const activeLink = "bg-gray-100 text-gray-900";
  const inactiveLink = "text-gray-600 hover:bg-gray-50 hover:text-gray-900";

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
      <Link
        href="/settings/members"
        className={`${link} ${pathname.startsWith("/settings") ? activeLink : inactiveLink}`}
      >
        Settings
      </Link>
    </nav>
  );
}
