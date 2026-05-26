import { ACTIVE_AGENCY_KEY } from "@/lib/agency-constants";

export { ACTIVE_AGENCY_KEY };

/** Read selected agency from localStorage (client only). */
export function getSelectedAgencyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_AGENCY_KEY);
  } catch {
    return null;
  }
}

/** Persist selected agency in localStorage and cookie (client only). */
export function setSelectedAgencyId(agencyId: string): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(ACTIVE_AGENCY_KEY, agencyId);
  } catch {
    // ignore quota / private mode
  }

  const encoded = encodeURIComponent(agencyId);
  document.cookie = `${ACTIVE_AGENCY_KEY}=${encoded}; path=/; max-age=31536000; SameSite=Lax`;
}
