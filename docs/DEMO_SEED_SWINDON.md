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

## After seeding

1. Log in with the account matching `DEMO_SEED_OWNER_USER_ID`.
2. The app uses your **newest** `agency_members` row (by `created_at`). If you own multiple agencies, re-run the seed and check the bootstrap verification block — it lists memberships and which agency the app will resolve. Agency switching is not implemented yet.
3. **Payroll:** open Payroll and generate a timesheet for a UTC range covering the next 14 days (RPC requires your logged-in admin/owner session).
4. **Compliance:** `/compliance` — missed visits + completed visits without care notes.
5. **Visit map:** `/visit-map` — geocoded Swindon postcodes and GPS check-in/out on completed visits.

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
