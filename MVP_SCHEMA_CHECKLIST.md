# MVP schema checklist (verify against live Supabase)

Use this to confirm RPCs/tables exist and PostgREST cache is refreshed (`NOTIFY pgrst, 'reload schema';`) after applying SQL.

**API routes** are under `src/app/api/`. Dependencies are **exact names** as used in code.

Master audit: [`docs/checklists/production-stabilisation-audit.md`](docs/checklists/production-stabilisation-audit.md)

---

## Verification status

**Legend:** Repo = present in this codebase. Production = you must confirm on live Supabase/Vercel.

| Area | Repo | Production |
|------|:----:|:----------:|
| 34 migrations in `supabase/migrations/` (through `20260228100100`) | ✅ | ✅ schema 2026-05-19 (MCP `care-route`); CLI migration history empty |
| `NOTIFY pgrst` documented | ✅ | ✅ run 2026-05-19 after `geocoded_at` |
| Core RPCs (clients, carers, visits, rota, payroll, billing) | ✅ | ✅ spot-check 2026-05-19 |
| Risk engine (`20260226000000`) | ✅ | ✅ `visit_risk_scores` + RPCs present |
| Care plans (`care_plans`, `care_plan_sections`) | ✅ | ✅ tables + RLS 2026-05-19 |
| Visit care notes (`visit_care_notes`) | ✅ | ✅ table + RLS 2026-05-19 |
| Visit map (`clients.geocoded_at`, GPS on `visit_actuals`) | ✅ | ✅ all columns 2026-05-19 (`geocoded_at` applied) |
| Vercel env + Supabase auth URLs | ✅ doc | [ ] confirm in dashboards |
| Compliance (`GET /api/compliance`) | ✅ | [ ] deploy + smoke (app-level) |

Apply order: [`supabase/scripts/RUN_MIGRATIONS.md`](supabase/scripts/RUN_MIGRATIONS.md) · Smoke test: [`docs/PRODUCTION_SMOKE_TEST.md`](docs/PRODUCTION_SMOKE_TEST.md)

---

## Production verification (operator — check on live Supabase)

### Auth / tenancy

- [ ] `get_client_postcode`, `update_client_geocode`, `agency_members` RLS
- [ ] `list_agency_members`, `list_invites`, `get_my_role`, `create_invite`, `accept_invite`

### Clients / carers / visits

- [ ] `update_client`, `archive_client`, `list_carers`, `insert_carer`, `archive_carer`
- [ ] `insert_visit`, `update_visit`, `update_visit_status`, `delete_visit`, `calculate_visit_risk`
- [ ] `insert_client`, `list_clients` (server actions / pages)

### Rota

- [ ] `list_carers_for_selection`, `list_visits_for_week`, `lookup_travel_cache`, `upsert_travel_cache`, `swap_visit_times`
- [ ] `recalculate_visit_risk_for_range`

### Check-in / payroll

- [ ] `check_in`, `check_out`, `admin_adjust_visit_time`, `get_visit_adjustments`
- [ ] `list_timesheets`, `generate_timesheet`, `get_timesheet_detail`, `approve_timesheet`
- [ ] Tables: `visit_actuals`, `visit_adjustments`, `timesheets`, `timesheet_lines`

### Billing

- [ ] `list_billing_for_range`, `list_billing_summary`, billing setup RPCs
- [ ] Tables/views: `funders`, `client_funders`, `funder_rates`, `billing_rates`

### Risk / cron

- [ ] `get_visit_risk`, `calculate_visit_risk`, table `visit_risk_scores`
- [ ] Cron env: `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`

### Care plans

- [ ] Tables `care_plans`, `care_plan_sections` + RLS (migration `20260227000000_care_plans.sql`)
- [ ] Archived plans enforce read-only updates at API level (`PATCH /api/clients/[id]/care-plan`, section PATCH/DELETE/POST paths)
- [ ] Default section templates include `mobility` and `nutrition_hydration`

### Visit care notes

- [ ] Table `visit_care_notes` (migration `20260227100000_visit_care_notes.sql`)
- [ ] `list_agency_members` author enrichment works (email/label rendered in notes UI)
- [ ] `note_type` supports and displays safeguarding/risk tags safely

### Visit map

- [ ] `clients.latitude` / `longitude` / `geocoded_at`; optional GPS on `visit_actuals`
- [ ] `GET /api/visit-map` returns 200 for manager+
- [ ] “Only show issues” filter works (late, missed, missing notes)

---

## Auth / tenancy

| Route | Depends on |
|-------|------------|
| `api/geocode/route.ts` | RPC `get_client_postcode`, `update_client_geocode`; table `agency_members` (select) |
| `api/settings/members/route.ts` | RPC `list_agency_members`, `list_invites`, `get_my_role`, `create_invite` |
| `api/invite/[token]/route.ts` | RPC `accept_invite` |

---

## Clients / carers / visits

| Route | Depends on |
|-------|------------|
| `api/clients/[id]/route.ts` | RPC `update_client`, `archive_client` |
| `api/carers/route.ts` | RPC `list_carers`, `insert_carer` |
| `api/carers/[id]/route.ts` | Table `carers` (update); RPC `archive_carer` |
| `api/visits/route.ts` | RPC `insert_visit`, `calculate_visit_risk` |
| `api/visits/[id]/route.ts` | RPC `update_visit`, `update_visit_status`, `delete_visit`, `calculate_visit_risk` |

**Also (not under `/api`):** `insert_client`, `list_clients` — server actions / pages.

---

## Rota

| Route | Depends on |
|-------|------------|
| `api/rota/route.ts` | RPC `list_carers_for_selection`, `list_visits_for_week`, `lookup_travel_cache`, `upsert_travel_cache` |
| `api/rota/swap/route.ts` | RPC `swap_visit_times` |
| `api/rota/risk-recalc/route.ts` | RPC `recalculate_visit_risk_for_range` |

**Tables (via RPCs):** `visits`, `visit_assignments`, `travel_cache`, etc.

---

## Check-in / payroll

| Route | Depends on |
|-------|------------|
| `api/visits/[id]/check-in/route.ts` | RPC `check_in` |
| `api/visits/[id]/check-out/route.ts` | RPC `check_out` |
| `api/visits/[id]/adjust/route.ts` | RPC `admin_adjust_visit_time`, `get_visit_adjustments` |
| `api/payroll/route.ts` | RPC `list_timesheets`, `generate_timesheet`; fallback tables `timesheets`, `timesheet_lines` |
| `api/payroll/[id]/route.ts` | RPC `get_timesheet_detail` |
| `api/payroll/[id]/approve/route.ts` | RPC `approve_timesheet` |
| `api/payroll/[id]/export/route.ts` | RPC `get_timesheet_detail` |

**Tables:** `visit_actuals`, `visit_adjustments`, `timesheets`, `timesheet_lines`, `audit_logs` (per payroll migration).

---

## Billing

| Route | Depends on |
|-------|------------|
| `api/billing/route.ts` | RPC `list_billing_for_range` |
| `api/billing/summary/route.ts` | RPC `list_billing_summary` |
| `api/billing/rates/route.ts` | RPC `list_billing_rates` |
| `api/billing/setup/route.ts` | RPC `list_funders`, `list_client_funders`, `list_clients`, `upsert_funder`, `delete_funder`, `upsert_billing_rate`, `delete_billing_rate`, `set_client_funder`, `clear_client_funder` |

**Tables:** `funders`, `client_funders`, `funder_rates`, `billing_rates`, views as defined in migrations.

---

## Risk / cron

| Route | Depends on |
|-------|------------|
| `api/visits/[id]/risk/route.ts` | RPC `get_visit_risk`, `calculate_visit_risk` |
| `api/cron/risk-recalc/route.ts` | Env `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`; table `visits` (select); RPC `calculate_visit_risk` |

**Tables:** `visit_risk_scores` (risk migration).

---

## Care plans

| Route | Depends on |
|-------|------------|
| `api/clients/[id]/care-plan/route.ts` | Tables `clients` (membership check), `care_plans`, `care_plan_sections`; `auth.getUser()` for `created_by` on insert; POST inserts default sections (needs, risks, medication, preferences, emergency) |
| `api/clients/[id]/care-plan/sections/route.ts` | Tables `care_plans`, `care_plan_sections` (insert); plan must belong to client + agency |
| `api/care-plan-sections/[id]/route.ts` | Tables `care_plan_sections`, `care_plans` (verify agency + plan) |

## Visit care notes

| Route | Depends on |
|-------|------------|
| `api/visits/[id]/care-notes/route.ts` | Tables `visits` (membership check), `visit_care_notes`; `auth.getUser()` for `author_id` on insert; GET enriches notes with `author_label` / `author_email` via RPC `list_agency_members` (joins `auth.users`) |
| `api/visit-care-notes/[id]/route.ts` | Table `visit_care_notes` (update/delete by id + agency) |

---

## Visit map

| Route | Depends on |
|-------|------------|
| `api/visit-map/route.ts` | RPC `list_visits_for_week`, `list_carers_for_selection`; tables `visit_actuals` (incl. optional GPS cols), `visit_care_notes`, `clients` (address, lat/lng); `get_my_role` / manager+ via `canAccessVisitMap` |

**Page:** `(dashboard)/visit-map` — same role gate in layout + nav.

---

## Compliance dashboard

| Route | Depends on |
|-------|------------|
| `api/compliance/route.ts` | RPC `list_visits_for_week`; tables `visit_actuals`, `visit_care_notes`; `get_my_role` / manager+ via `canAccessCompliance` |

**Page:** `(dashboard)/compliance` — layout + nav gate (owner, admin, manager). Query params `start`, `end` (YYYY-MM-DD; default last 7 days).

---

## Other

| Route | Depends on |
|-------|------------|
| `api/health/route.ts` | None (optional `VERCEL_GIT_COMMIT_SHA`) |
