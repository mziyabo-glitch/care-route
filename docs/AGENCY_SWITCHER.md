# Agency switcher — removed (2026-05-26)

**Status:** Removed. v1 (cookie + `localStorage` + header dropdown) was implemented briefly and rolled back as unnecessary complexity for the current MVP stage.

## Current behaviour

`getCurrentAgencyId()` in `src/lib/agency.ts` resolves tenancy from the authenticated user's `agency_members` row with the **newest** `created_at` (`ORDER BY created_at DESC LIMIT 1`). There is no UI to switch agencies and no client-side preference storage.

Users with multiple agency memberships always see data for that newest membership. To work in another agency, use a separate login or adjust membership `created_at` in the database (not supported in product UI).

## If reintroducing later

Consider: server-side `user_agency_preferences` table, membership-validated selection, audit of cron/service-role paths that bypass user tenancy, and explicit multi-agency onboarding — rather than cookie/localStorage alone.
