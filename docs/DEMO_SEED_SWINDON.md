# Swindon Community Care Demo seed

Idempotent demo data for end-to-end testing: **Swindon Community Care Demo** agency with 30 carers, 40 clients, a **rolling 31-day month** of visits (~868 visits), care plans, visit notes, billing, compliance, and visit map coverage.

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
4. **Smoke:** expect **40 clients, 30 carers, ~868 visits** on Dashboard / Clients / Carers / Visits.
5. **Payroll:** open Payroll and generate a timesheet for the full 31-day rolling window (today-14 → today+16). RPC requires owner/admin session.
6. **Compliance:** `/compliance` — missed visits + completed visits without care notes (the no-notes cohort, ~8%).
7. **Visit map:** `/visit-map` — geocoded Swindon postcodes and GPS check-in/out on completed visits.
8. **Billing:** `/billing` and `/billing/summary` — Swindon Demo LA funder with rates.
9. **Care plans:** open any client → Care Plan tab — 5 default sections per plan.
10. **Rota:** view any week within the date range — dense scheduled/completed slots visible.

## What gets created

| Entity | Count | Notes |
|--------|------:|-------|
| Agency | 1 | Swindon Community Care Demo |
| Carers | 30 | `demo-sw-carer-N@swindon.care-route.demo` |
| Clients | 40 | `Demo Client N (Area)` — SN* postcodes |
| Visits | ~868 | Rolling 31 days (today−14 → today+16) |
| Care plans | 35 | Active + 5 default sections each |
| Visit care notes | ~600+ | Gaps left for compliance testing (~8% no-notes cohort) |
| Funder | 1 | Swindon Demo LA + rates + billing_rates |

### Visit status mix (approximate)

| Cohort | Target % | Status in DB |
|--------|----------|--------------|
| Completed on-time | 45% | `completed` |
| Completed late (actuals show late check-in) | 10% | `completed` |
| Completed — missing notes | 8% | `completed` |
| Missed / no-show | 7% | `missed` |
| In progress (checked in, not out) | ~2% | `in_progress` |
| Future scheduled | ~30% | `scheduled` |

**Valid status values used:** `scheduled`, `in_progress`, `completed`, `missed`.
`cancelled` is **not** a valid status in the schema (constraint: `scheduled|in_progress|completed|missed`) — no-show visits use `missed`.

### Call windows

| Window | Time range | Default duration |
|--------|-----------|-----------------|
| Morning | 07:00–10:30 | 30 min |
| Lunch | 11:30–14:00 | 45 min |
| Tea | 15:30–18:30 | 30 min |
| Bedtime | 19:00–22:30 | 45 min |

### Double-ups

~20% of visits have a secondary carer via `visit_assignments` (role=`secondary`).

### Visit types

Represented in `visits.notes` text: personal care, medication prompt, breakfast support, meal prep, welfare check, companionship, domestic support, continence support, mobility support, bed transfer, reablement, shopping support.

## Suggested test date ranges

After seed (today = day 0):

| Test scope | Date range |
|-----------|-----------|
| Full rolling month | today−14 → today+16 |
| Past fortnight (payroll/billing) | today−14 → yesterday |
| Current week | today−3 → today+3 |
| Future fortnight (rota) | tomorrow → today+14 |

## Demo identifiers

- Agency: `Swindon Community Care Demo`
- Visit tag in notes: `[DEMO_VISIT_SEED]`
- Carer emails: `demo-sw-carer-{1..30}@swindon.care-route.demo`
- Client names: `Demo Client {1..40} ({Swindon area})`

No separate demo login is created — use your existing Supabase user as owner.

## Care Control Centre dashboard — demo coverage & gaps

After seed, the dashboard (`/dashboard`) should show non-zero **visits today**, mixed safety counts, **needs action** rows (missed, late, missing notes, in-progress, double-up gaps where seeded), rota capacity, billing/payroll today snapshot (manager/owner), and visit map preview with geocoded Swindon clients.

| Dashboard area | Swindon seed support | Gap / note |
|----------------|---------------------|------------|
| Hero / agency name | Yes | Requires demo agency as `getCurrentAgencyId()` (reseed + sign-in) |
| Today's safety status | Yes | Counts vary by time of day (late/due_soon need visits started today) |
| Needs action | Yes | ~7% missed, ~8% no-notes, ~2% in_progress, double-up flags on subset |
| Happening now / Up next | Partial | Strongest during morning–evening UK call windows; quiet overnight |
| Rota capacity | Yes | 30 carers; daily assignment counts vary |
| Compliance pulse (tracked) | Yes | Same signals as `/compliance` for today |
| Compliance pulse (not tracked) | N/A | Care plan review overdue, training expiry, safeguarding — **not in seed or schema** |
| Payroll snapshot (today) | Yes | Owner/admin; hours from actuals/planned — timesheet not auto-generated |
| Billing snapshot (today) | Yes | Manager+; requires funder/rates (seeded) |
| Visit map preview | Yes | Geocoded SN* postcodes; some clients may lack coords until geocode run |
| Care plans — 5 clients without plan | Yes | 35/40 have plans — **no "overdue review" tile** (field not implemented) |
| Viewer role demo | Not seeded | Viewer sees reduced dashboard (no billing/map tiles) — use owner account for full demo |

**Smoke (dashboard):** Log in as seed owner → `/dashboard` → confirm agency name "Swindon Community Care Demo", today's visit count &gt; 0, and at least one needs-action card during UK daytime after seed.
