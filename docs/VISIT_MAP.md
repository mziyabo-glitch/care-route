# Visit map (MVP)

## Scope

Manager-only **static daily map** of scheduled visits at **client geocoded addresses** (from `clients.latitude` / `clients.longitude`). One pin per visit for the selected calendar date.

- **In scope:** date filter (default today, UK display), status-coloured pins, side panel / popup with client, carer(s), schedule, check-in/out from `visit_actuals`, link to `/visits`.
- **Out of scope:** live carer GPS, compliance dashboard, new location tables, mobile background tracking.

## Access control

- Nav link and `/visit-map` page: `owner`, `admin`, `manager` (same as billing).
- `GET /api/visit-map?date=YYYY-MM-DD` returns **403** for other roles.

## Data sources

| Data | Source |
|------|--------|
| Visits, client lat/lng, carers | RPC `list_visits_for_week` for UTC day window |
| Check-in / check-out | `visit_actuals.check_in_at`, `check_out_at` (merged in API) |
| Client coordinates | `clients.latitude`, `clients.longitude` (geocode via Clients UI / `update_client_geocode`) |

### Date window

The API uses **UTC midnight–midnight** for the `date` query param (`YYYY-MM-DD`). The UI defaults to “today” via `Europe/London` calendar date. See `src/lib/visit-map.ts`.

## Pin status colours

| Display status | Rule | Colour |
|----------------|------|--------|
| `scheduled` | `visits.status = scheduled`, start not yet passed (or passed with check-in) | Blue |
| `late` | `scheduled`, `start_time` ≤ now, **no** `check_in_at` | Amber |
| `in_progress` | `visits.status = in_progress` | Purple |
| `completed` | `visits.status = completed` | Green |
| `missed` | `visits.status = missed` | Red |

**Late rule (code):** `resolveDisplayStatus()` in `src/lib/visit-map.ts` — only applies while status remains `scheduled`; once checked in or status changes, late no longer applies.

Visits without client coordinates are listed in the API response but **not** plotted; geocode on the Clients page.

## Schema gaps (explicit)

### `visit_actuals` — no GPS columns

Migration `20260224000000_visit_actuals_payroll.sql` defines:

- `check_in_at`, `check_out_at`, sources, `break_minutes`
- **No** `check_in_latitude`, `check_in_longitude`, or similar

**Impact:** Check-in/out **times** appear in the panel; **secondary GPS markers** at actual check-in locations are **not** implemented. Adding them requires a product decision, mobile capture, and a new migration — not invented in this MVP.

### `clients.geocoded_at`

Not present in migrations. Coordinates are set by geocode RPC without a timestamp column. **No migration added** — not required for MVP.

## Live tracking (deferred)

Real-time carer positions need:

- Explicit consent and lawful basis (UK GDPR / workforce monitoring)
- Mobile app background location, retention, and audit policy
- Separate storage (not `visit_actuals` alone) and manager UX distinct from this daily plan map

This MVP intentionally shows **where clients are** and **visit state**, not **where carers are now**.

## Routes

- Page: `src/app/(dashboard)/visit-map/page.tsx`
- API: `src/app/api/visit-map/route.ts`
- Library: `src/lib/visit-map.ts`

## Map stack

Leaflet + react-leaflet + OpenStreetMap tiles. Map component is client-only (`dynamic(..., { ssr: false })`).
