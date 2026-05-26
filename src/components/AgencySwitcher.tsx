"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
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

function hasActiveAgencyCookie(): boolean {
  return document.cookie
    .split("; ")
    .some((part) => part.startsWith(`${ACTIVE_AGENCY_KEY}=`));
}

export function AgencySwitcher({ agencies, currentAgencyId }: AgencySwitcherProps) {
  const router = useRouter();
  const current = agencies.find((a) => a.agency_id === currentAgencyId);
  const didSeedStorage = useRef(false);

  useEffect(() => {
    if (didSeedStorage.current) return;
    if (!agencies.some((a) => a.agency_id === currentAgencyId)) return;

    didSeedStorage.current = true;

    const stored = getSelectedAgencyId();
    if (stored === currentAgencyId) {
      if (!hasActiveAgencyCookie()) setSelectedAgencyId(currentAgencyId);
      return;
    }

    if (!stored) {
      setSelectedAgencyId(currentAgencyId);
    }
  }, [agencies, currentAgencyId]);

  const onChange = (agencyId: string) => {
    if (agencyId === currentAgencyId) return;
    setSelectedAgencyId(agencyId);
    router.refresh();
  };

  const addAgencyLink = (
    <Link
      href="/onboarding?new=1"
      className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-500"
    >
      Add agency
    </Link>
  );

  if (agencies.length === 0) {
    return null;
  }

  if (agencies.length === 1) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700" title="Agency">
          {current?.name ?? agencies[0].name}
        </span>
        {addAgencyLink}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
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
      {addAgencyLink}
    </div>
  );
}
