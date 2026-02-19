export type LatLng = { lat: number; lng: number };

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;
const AVG_SPEED_KMH = 30;
const BUFFER_MINUTES = 5;

/**
 * Haversine distance in km between two lat/lng points.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) *
      Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimate travel minutes from distance at average road speed + buffer.
 */
export function travelMinutesFromKm(km: number): number {
  return Math.round((km / AVG_SPEED_KMH) * 60) + BUFFER_MINUTES;
}

/**
 * Full travel estimate between two clients.
 * Returns null if either lat/lng is missing.
 */
export function estimateTravel(
  lat1: number | null | undefined,
  lng1: number | null | undefined,
  lat2: number | null | undefined,
  lng2: number | null | undefined
): { distanceKm: number; minutes: number } | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) {
    return null;
  }
  const km = haversineKm(lat1, lng1, lat2, lng2);
  return { distanceKm: Math.round(km * 10) / 10, minutes: travelMinutesFromKm(km) };
}

/**
 * Postcode-based heuristic fallback (when no lat/lng available).
 */
export function estimateTravelFromPostcodes(
  postcodeA: string | null | undefined,
  postcodeB: string | null | undefined
): number {
  const a = (postcodeA ?? "").toUpperCase().trim();
  const b = (postcodeB ?? "").toUpperCase().trim();
  if (!a || !b) return 15;
  const outwardA = a.split(/\s/)[0] ?? "";
  const outwardB = b.split(/\s/)[0] ?? "";
  if (outwardA === outwardB) return 10;
  if (outwardA.slice(0, 2) === outwardB.slice(0, 2)) return 18;
  return 25;
}
