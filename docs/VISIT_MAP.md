# Visit map (MVP)

## Scope

Manager-only **static daily map** of scheduled visits at **client geocoded addresses** (from `clients.latitude` / `clients.longitude`). One pin per visit for the selected calendar date.

- **In scope:** date filter (default today, UK display), optional carer filter, status-coloured pins, side panel / popup with client, address, carer(s), schedule, check-in/out from `visit_actuals`, missing-care-note and distance warnings, link to `/visits`, fallback table when the map fails or visits lack coordinates.
- **Out of scope:** live carer GPS, compliance dashboard, continuous background tracking.

## Access control

- Nav link and `/visit-map` page: `owner`, `admin`, `manager` (`canAccessVisitMap` in `src/lib/permissions.ts`).
- `GET /api/visit-map?date=YYYY-MM-DD&carer_id=<uuid>` returns **403** for other roles.

## Data sources

| Data | Source |
|------|--------|
| Visits, client lat/lng, carers | RPC `list_visits_for_week` for UTC day window |
| Client address | `clients.address` / `postcode` (merged in `getVisitMapRows`) |
| Check-in / check-out | `visit_actuals` (times + optional GPS columns) |
| Care notes flag | `visit_care_notes` (no row ⇒ `missing_care_note` when visit completed/checked out) |
| Client coordinates | `clients.latitude`, `clients.longitude`; `geocoded_at` when set via geocode RPC |

### Date window

The API uses **UTC midnight–midnight** for the `date` query param (`YYYY-MM-DD`). The UI defaults to “today” via `Europe/London` calendar date. See `src/lib/visit-map.ts`.

## Pin status colours

| Display status | Rule | Colour |
|----------------|------|--------|
| `scheduled` | `visits.status = scheduled`, not due soon / late | Blue |
| `due_soon` | `scheduled`, start within 30 minutes, no check-in | Cyan |
| `late` | `scheduled`, `start_time` ≤ now, **no** `check_in_at` | Amber |
| `in_progress` | `visits.status = in_progress` | Purple |
| `completed` | `visits.status = completed` | Green |
| `missed` | `visits.status = missed` | Red |

**Late / due soon:** `resolveDisplayStatus()` in `src/lib/visit-map.ts`.

**Distance warning:** check-in GPS more than **500 m** from client lat/lng (haversine), when `visit_actuals.check_in_latitude` / `check_in_longitude` are present.

Visits without client coordinates appear in the API and in the **fallback table**; they are not plotted until geocoded on the Clients page.

## Schema (migrations)

| Column / table | Migration |
|----------------|-----------|
| `clients.latitude`, `longitude` | `20260218250000_travel_geolocation.sql` |
| `clients.geocoded_at` | `20260228100000_client_geocoded_at.sql` |
| `visit_actuals` GPS | `20260228100100_visit_actuals_gps.sql` |
| `visit_care_notes` | `20260227100000_visit_care_notes.sql` |

## Live tracking (deferred)

Real-time carer positions need explicit consent, lawful basis (UK GDPR), mobile capture, retention policy, and storage separate from this daily plan map. This MVP shows **where clients are** and **visit state**, not **where carers are now**.

### Future enhancements

- Mobile capture of check-in/out GPS into `visit_actuals`
- Pin or overlay for check-in location vs client address
- London-local day window (instead of UTC midnight)
- Compliance dashboard (missed visits + missing notes aggregate)
- Export / print daily map snapshot

## Routes

- Page: `src/app/(dashboard)/visit-map/page.tsx`
- API: `src/app/api/visit-map/route.ts`
- Data: `src/lib/visit-map-data.ts`
- Display helpers: `src/lib/visit-map.ts`

## Map stack

Leaflet + react-leaflet + OpenStreetMap tiles. Map component is client-only (`dynamic(..., { ssr: false })`).
