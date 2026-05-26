# Swindon Community Care Demo seed

Idempotent demo data for end-to-end testing: **Swindon Community Care Demo** agency with 30 carers, 40 clients, 14 days of visits, care plans, visit notes, billing, compliance, and visit map coverage.

## Safety

- **Requires** `ALLOW_DEMO_SEED=true` or the script exits immediately.
- Prints `NEXT_PUBLIC_SUPABASE_URL` before any writes.
- Only creates/updates rows for the named demo agency.
- **Visit refresh:** deletes visits whose `notes` contain `[DEMO_VISIT_SEED]` for that agency only, then recreates them. Production visits are untouched.
- Carers/clients are reused by demo email (`carers`) or stable display name (`clients`).

## Prerequisites

1. Supabase migrations applied (through `20260228100100_visit_actuals_gps.sql` at minimum).
2. A real Supabase Auth user (your login) — copy its UUID from **Authentication → Users**.
3. Env vars (e.g. `.env.local`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DEMO_SEED_OWNER_USER_ID=your-auth-user-uuid
ALLOW_DEMO_SEED=true
```

Use a **local or staging** project when possible. Do not run against production unless you intend to add demo data there.

## Run

```bash
npm install
npm run seed:swindon-demo
```

Re-running is safe: carers/clients/plans are reused; demo-tagged visits are replaced.

## Agency resolution — no switcher

The app has **no visible agency switcher**. `getCurrentAgencyId()` always picks the `agency_members` row with the **newest `created_at` DESC**. The seed script bumps the demo membership's `created_at` to `now()` on every run, so the demo agency is always the winner after a fresh seed.

**If the wrong agency loads after login:**

1. Rerun the seed (`npm run seed:swindon-demo`) — it will bump `created_at` to now and print the resolved agency name.
2. Sign out, then sign back in. The server reads the freshest membership on each request.

An agency switcher UI is **deferred** — resolution is deterministic via `created_at` order.

## After seeding

1. Log in with the account matching `DEMO_SEED_OWNER_USER_ID`.
2. The resolved agency will be **Swindon Community Care Demo** — confirmed in the seed summary line `After seed, getCurrentAgencyId() will resolve to: …`.
3. **Sign out / sign in** after reseeding so the server session picks up the refreshed membership.
4. **Smoke:** expect **40 clients, 30 carers, 168 visits** on Dashboard / Clients / Carers / Visits.
5. **Payroll:** open Payroll and generate a timesheet for a UTC range covering the next 14 days (RPC requires owner/admin session).
6. **Compliance:** `/compliance` — missed visits + completed visits without care notes.
7. **Visit map:** `/visit-map` — geocoded Swindon postcodes and GPS check-in/out on completed visits.
8. **Billing:** `/billing` and `/billing/summary` — Swindon Demo LA funder with rates.
9. **Care plans:** open any client → Care Plan tab — 5 default sections per plan.

## What gets created

| Entity | Count | Notes |
|--------|------:|-------|
| Agency | 1 | Swindon Community Care Demo |
| Carers | 30 | `demo-sw-carer-N@swindon.care-route.demo` |
| Clients | 40 | `Demo Client N (Area)` — SN* postcodes |
| Visits | 168 | Next 14 days; mixed statuses |
| Care plans | 35 | Active + 5 default sections each |
| Visit care notes | ~19 | Gaps left for compliance testing |
| Funder | 1 | Swindon Demo LA + rates + billing_rates |

Visit mix includes single/double-up, morning/lunch/tea/bedtime, 15–60 min, mileage on some rows, completed (with actuals/GPS), missed, and in-progress.

## Demo identifiers

- Agency: `Swindon Community Care Demo`
- Visit tag in notes: `[DEMO_VISIT_SEED]`
- Carer emails: `demo-sw-carer-{1..30}@swindon.care-route.demo`
- Client names: `Demo Client {1..40} ({Swindon area})`

No separate demo login is created — use your existing Supabase user as owner.
