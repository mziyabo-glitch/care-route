# Swindon Care Demo Agency seed

Scenario-based fictional demo data for CQC compliance, care plans, visits, confidentiality, payroll/billing, and dashboard visual testing.

## Part A — Audit (current setup)

### Existing seed files

| File | Purpose |
|------|---------|
| `scripts/seed-swindon-demo-agency.ts` | Main seed runner (service role) |
| `scripts/seed-swindon-demo-data.ts` | Fictional scenarios (clients, visits, CQC, care plan traffic) |
| `docs/DEMO_SEED_SWINDON.md` | This document |

No `supabase/seed.sql` — seeding is via the TypeScript script only.

### Tables touched

| Area | Tables |
|------|--------|
| Agency | `agencies`, `agency_members` |
| People | `carers` (staff profiles; owner is auth user only) |
| Service users | `clients` |
| Visits | `visits`, `visit_assignments`, `visit_actuals`, `visit_care_notes`, `visit_risk_scores` |
| Care plans | `care_plans`, `care_plan_sections` |
| CQC | `cqc_evidence_items` |
| Billing | `funders`, `funder_rates`, `client_funders` |

### Recommended approach

1. Apply migrations through `20260527100200_confidentiality_rls.sql` (CQC + care plan review + confidentiality RLS).
2. Use a **staging/local** Supabase project with `ALLOW_DEMO_SEED=true`.
3. Run `npm run seed:swindon-demo` — idempotent upsert by email/slug tags.
4. Sign out/in so `getCurrentAgencyId()` picks the demo agency (membership `created_at` bumped).
5. **Do not weaken RLS** — seed uses service role; app behaviour stays production-like.

Legacy agency name `Swindon Community Care Demo` is **renamed** to `Swindon Care Demo Agency` on first run after upgrade.

### Schema gaps (no migration added)

| Desired field | Status |
|---------------|--------|
| Client `preferred_name` column | Stored in `clients.notes` (demo tag) |
| Client `date_of_birth` / age | Age in notes only |
| Client `risk_level` column | In notes only |
| Emergency contact column | In notes only |
| Visit `cancelled` status | **Not in schema** — use `missed` |
| Auth user for Sarah Coordinator | **Not seeded** — manager is a `carers` row only; login remains `DEMO_SEED_OWNER_USER_ID` |
| `user_id` link on carers | Not required for demo |

---

## Safety

- **Requires** `ALLOW_DEMO_SEED=true` or the script exits.
- Prints `NEXT_PUBLIC_SUPABASE_URL` before writes.
- Only updates the demo agency (by name or legacy name).
- **Visit refresh:** deletes visits whose `notes` contain `[DEMO_VISIT_SEED]` only.
- **Fictional data only** — no real people or addresses.

## Prerequisites

1. Migrations applied (minimum: visit actuals; for full demo include `20260527100000` CQC and `20260527100100` / `20260527100200` care plan + confidentiality).
2. Supabase Auth user UUID → `DEMO_SEED_OWNER_USER_ID`.
3. Env (e.g. `.env.local`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DEMO_SEED_OWNER_USER_ID=your-auth-user-uuid
ALLOW_DEMO_SEED=true
```

## Run

```bash
npm install
npm run seed:swindon-demo
```

Re-running is safe: entities are matched by demo tags/emails; demo visits are replaced.

## Demo agency & staff

| Role | Name | Notes |
|------|------|-------|
| Owner (auth) | Brian Demo Admin | Your `DEMO_SEED_OWNER_USER_ID` login |
| Coordinator | Sarah Coordinator | `carers` row, role `manager` — no separate login |
| Carer | Amara Williams | |
| Carer | James Patel | |
| Carer | Chloe Evans | |
| Carer | David Morgan | |
| Carer | Grace Taylor | |
| Carer | Mohammed Ali | |

Emails: `*@swindon.care-route.demo`

## Service users (10)

| # | Name | Care plan | Risk | Key scenario |
|---|------|-----------|------|----------------|
| 1 | Margaret Ellis | Green | Medium | Mobility, walking frame, good records |
| 2 | Arthur Bennett | Red | High | Dementia, overdue review, missed visit |
| 3 | Priya Shah | Amber | Medium | Diabetes, nutrition, late visit today |
| 4 | George Williams | Green | Medium | Reablement, in-progress visit today |
| 5 | Eileen Carter | Red | High | EOL, restricted/confidential plan |
| 6 | Frank Thompson | Amber | Medium | Refused medication note |
| 7 | Linda Morris | Amber | Medium | Completed visit, no notes |
| 8 | Ahmed Khan | Red | High | Double-up gap (one carer checked in) |
| 9 | Joan Phillips | Amber | Medium | Incomplete nutrition section |
| 10 | Robert Green | Green | Low | Gold-standard compliant example |

## Visit window

Anchored on **seed run day** (UK date):

| Offset | Purpose |
|--------|---------|
| Yesterday | Completed, missed, no-notes (payroll/compliance) |
| Today | Late, in-progress, double-up gap, completed |
| Tomorrow / +7 | Scheduled future rota |

Call windows: morning, lunch, tea, bedtime (see script `CALL_WINDOWS`).

### Visit scenarios seeded

| Scenario | Example client | Dashboard / compliance |
|----------|----------------|------------------------|
| Completed + note | Margaret, Robert | Green completed counts |
| Late (no check-in) | Priya (today lunch) | Needs action — late |
| Missed | Arthur (yesterday) | Missed + CQC Safe item |
| No notes | Linda, Frank | Notes outstanding |
| Medication concern | Frank | Note body flags refusal |
| Nutrition concern | Priya, Joan | Note + Effective CQC |
| Double-up gap | Ahmed | Missing second carer |
| In progress | George | Happening now |
| Scheduled | Tomorrow / +7 | Upcoming rota |

## Care plans

- **12 sections** per client (domiciliary templates from app).
- **Traffic lights:** green = review in 90d; amber = due in 7d + incomplete nutrition; red = overdue 21d + restricted plan.
- **Confidential:** `confidential_notes` section restricted; red plans may restrict `risks_hazards`.
- Carers without assignment **cannot** read restricted sections (RLS).

## CQC evidence (13 items)

Maps to five key questions with mixed `open` / `in_review` / `complete` and `low` / `medium` / `high` risk. Due dates span overdue, today, this week, and future.

Tagged `[DEMO_CQC_SEED]` in description for idempotent upsert.

## Scenario matrix

| Scenario | Service user | Expected dashboard | Expected CQC / compliance |
|----------|--------------|--------------------|---------------------------|
| Good completed visit | Margaret / Robert | Completed ↑, notes OK | Well-led / Caring complete examples |
| Missed visit | Arthur | Missed ↑ | Safe — investigation open |
| Late visit | Priya | Late ↑ | — |
| No visit note | Linda | Notes outstanding ↑ | Well-led — note audit |
| In progress | George | Happening now | — |
| Double-up gap | Ahmed | Needs action (joint) | Safe — handling risk |
| Medication refusal | Frank | Needs action (note) | Safe — in review |
| Overdue care plan | Arthur | Compliance pulse overdue | Effective — review overdue |
| Restricted plan | Eileen | No sensitive text on cards | Well-led confidentiality review |
| Nutrition gap | Joan | Care plan incomplete | Effective — diabetes item |
| Reablement | George | — | Effective — discharge responsive |
| Stable package | Robert | All clear bias | Caring preferences complete |

## Agency resolution

No agency switcher. `getCurrentAgencyId()` uses newest `agency_members.created_at`. Seed bumps demo membership on each run.

## After seeding

1. Log in as `DEMO_SEED_OWNER_USER_ID`.
2. Confirm agency **Swindon Care Demo Agency**.
3. **Dashboard:** visits today, late, missed, notes missing, needs action.
4. **Visits / Visit map:** SN* geocoded clients, GPS on completed.
5. **Care plans:** per-client traffic lights; Arthur overdue; restricted sections for Eileen.
6. **Compliance (`/compliance`):** CQC categories + overdue reviews.
7. **Payroll / Billing:** generate timesheet for yesterday–today completed actuals.
8. **Confidentiality:** log in as carer (future: linked auth) — restricted sections hidden.

## Dashboard coverage

| Area | Seeded? |
|------|---------|
| Safety cards (today) | Yes |
| Needs action | Yes |
| Happening now / Up next | Yes (daytime UK) |
| Care plan overdue pulse | Yes (Arthur, Eileen, Ahmed) |
| CQC high-risk open | Yes |
| Payroll/billing today | Yes (owner; actuals on completed) |
| Training / safeguarding tiles | No schema |

## Identifiers

- Agency: `Swindon Care Demo Agency`
- Visit tag: `[DEMO_VISIT_SEED]`
- Client tag: `[DEMO_CLIENT] slug=<slug>`
- CQC tag: `[DEMO_CQC_SEED] slug=<slug>`
