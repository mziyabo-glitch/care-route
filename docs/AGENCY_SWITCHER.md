# Agency switcher (v1) — complete

**Status:** v1 complete (2026-05-26). Cookie + `localStorage` selection, membership validation, header UI on all dashboard routes.

Users with multiple `agency_members` rows can choose which agency the dashboard uses. Selection is stored in the browser and mirrored to a cookie so server components and API routes resolve the same tenant.

## Storage

| Layer | Key | Purpose |
|-------|-----|---------|
| `localStorage` | `care-route.activeAgencyId` | Client persistence across sessions |
| Cookie | `care-route.activeAgencyId` | Read by `getCurrentAgencyId()` on the server |

On switch, `AgencySwitcher` writes both (via `src/lib/agency-client.ts`) and calls `router.refresh()`.

Cookie attributes: `path=/`, `SameSite=Lax`, `max-age=31536000` (one year). Value is `encodeURIComponent`’d on write.

## Resolution (`getCurrentAgencyId`)

1. Load all memberships via `getUserAgencies()` (with agency name and role).
2. If the cookie value matches a membership `agency_id`, use it.
3. Otherwise use the membership with the newest `created_at` (DESC) — `resolveAgencyId()` in `src/lib/agency-constants.ts`.
4. Client: `AgencySwitcher` syncs localStorage + cookie to the resolved id when they drift (including re-setting cookie if localStorage matches but cookie is missing).

**Security:** The server never trusts `localStorage` or a raw client body for `agency_id`. Cookie preference is always validated against the user's memberships. Invalid or stale cookie values fall back to the newest membership.

## UI

- Header on all `(dashboard)` routes: `AgencySwitcher` next to email / logout (`src/app/(dashboard)/layout.tsx`).
- **One agency:** static label (agency name).
- **Multiple agencies:** `<select>` dropdown; change triggers `setSelectedAgencyId` + `router.refresh()`.
- **Zero agencies:** switcher hidden; layout redirects to `/onboarding`.

## Roles

`getCurrentRole()` calls `get_my_role` with the resolved `agency_id`, then `normalizeRole()`. Permissions (billing, payroll, visit map, compliance, nav visibility) follow the **selected** agency's role.

## Routes audited (v1)

All use `getCurrentAgencyId()` directly or via `getCurrentRole()`:

| Area | Server pages | API |
|------|--------------|-----|
| Dashboard | `/dashboard` | — |
| Clients | `/clients`, `/clients/[id]/care-plan` | `/api/clients/*`, care-plan sections |
| Carers | `/carers` | `/api/carers`, `/api/carers/[id]` |
| Visits | `/visits` | `/api/visits/*`, care-notes, check-in/out, adjust, risk |
| Rota | `/rota` (client) | `/api/rota`, `/api/rota/swap`, `/api/rota/risk-recalc` |
| Billing | `/billing`, setup, summary (client) | `/api/billing`, rates, setup, summary |
| Payroll | `/payroll` (client) | `/api/payroll/*` |
| Visit map | `/visit-map` (client) | `/api/visit-map` |
| Compliance | `/compliance` (client) | `/api/compliance` |
| Settings | `/settings/members` | `/api/settings/members` |
| Geocode | — | `/api/geocode` (updated for v1) |

**Exceptions by design (no tenant switch):**

- `auth/callback`, `onboarding` — membership bootstrap
- `api/invite/[token]`, `api/health` — token or health checks
- `api/cron/risk-recalc` — service role, all agencies in date range (see backlog)

## Testing locally

1. Use a user in two agencies (e.g. Pro Health + Swindon demo after `npm run seed:swindon-demo`). See `docs/DEMO_SEED_SWINDON.md`.
2. Log in and open any dashboard route.
3. Confirm the header shows the agency name or dropdown.
4. Switch agency — page data (clients, visits counts, etc.) should match the other tenant after refresh.
5. Reload the browser; selection should stick (`localStorage` + cookie).
6. DevTools → Application: verify `care-route.activeAgencyId` in localStorage and Cookies.
7. Set cookie/localStorage to a random UUID — app should fall back to newest membership (no error).

### Verified (2026-05-26)

- `npx tsc --noEmit` — pass
- `npm run build` — pass
- User `aedb68fc-e216-473c-ae12-4c5da0528871` — owner on **Pro Health** and **Swindon Community Care Demo** (live DB via service role):
  - Swindon: 40 clients, 30 carers, 168 visits
  - Pro Health: 19 clients, 4 carers, 19 visits
- Code review: dashboard pages and listed APIs scope by resolved agency; visit create/update uses `getCurrentAgencyId()` for `p_agency_id`, not body `agency_id`.

Manual UI switch test on production/staging is still recommended before deploy.

## Production

Same behaviour. Ensure cookies are not stripped by middleware/proxy. Cookie uses `path=/`, `SameSite=Lax`, one-year `max-age`.

## Future backlog (not v1)

- **Cron / service paths:** Audit agency scoping — e.g. `api/cron/risk-recalc` uses service role and processes visits across all agencies in range.
- **Edge functions / scripts outside `src`:** Audit for hard-coded or missing agency filters (`scripts/`, Supabase edge functions).
- **Client `agency_id` in API bodies:** Reject or verify any `agency_id` sent from the client unless membership-checked (today most routes ignore body `agency_id` and use `getCurrentAgencyId()` / `getCurrentRole()`).
- **Optional:** Server-side `user_agency_preferences` table to persist selected agency per user (cookie/localStorage remain acceptable for v1).
