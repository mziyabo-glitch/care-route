"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ACTIVE_AGENCY_KEY, type UserAgency } from "@/lib/agency-constants";
import {
  getSelectedAgencyId,
  setSelectedAgencyId,
} from "@/lib/agency-client";

type AgencySwitcherProps = {
  agencies: UserAgency[];
  currentAgencyId: string;
};

export function AgencySwitcher({ agencies, currentAgencyId }: AgencySwitcherProps) {
  const router = useRouter();
  const current = agencies.find((a) => a.agency_id === currentAgencyId);

  useEffect(() => {
    if (!agencies.some((a) => a.agency_id === currentAgencyId)) return;

    const stored = getSelectedAgencyId();
    if (stored === currentAgencyId) {
      const cookieMatch = document.cookie
        .split("; ")
        .some((part) => part.startsWith(`${ACTIVE_AGENCY_KEY}=`));
      if (!cookieMatch) setSelectedAgencyId(currentAgencyId);
      return;
    }

    setSelectedAgencyId(currentAgencyId);
  }, [agencies, currentAgencyId]);

  if (agencies.length === 0) {
    return null;
  }

  if (agencies.length === 1) {
    return (
      <span className="text-sm font-medium text-slate-700" title="Agency">
        {current?.name ?? agencies[0].name}
      </span>
    );
  }

  const onChange = (agencyId: string) => {
    if (agencyId === currentAgencyId) return;
    setSelectedAgencyId(agencyId);
    router.refresh();
  };

  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="sr-only">Switch agency</span>
      <select
        value={currentAgencyId}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[14rem] truncate rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        aria-label="Switch agency"
      >
        {agencies.map((agency) => (
          <option key={agency.agency_id} value={agency.agency_id}>
            {agency.name}
          </option>
        ))}
      </select>
    </label>
  );
}
