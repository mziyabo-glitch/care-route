# MVP schema checklist (verify against live Supabase)

Use this to confirm RPCs/tables exist and PostgREST cache is refreshed (`NOTIFY pgrst, 'reload schema';`) after applying SQL.

**API routes** are under `src/app/api/`. Dependencies are **exact names** as used in code.

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
| `api/clients/[id]/care-plan/route.ts` | Tables `clients` (membership check), `care_plans`, `care_plan_sections`; `auth.getUser()` for `created_by` on insert |
| `api/clients/[id]/care-plan/sections/route.ts` | Tables `care_plans`, `care_plan_sections` (insert); plan must belong to client + agency |
| `api/care-plan-sections/[id]/route.ts` | Tables `care_plan_sections`, `care_plans` (verify agency + plan) |

## Visit care notes

| Route | Depends on |
|-------|------------|
| `api/visits/[id]/care-notes/route.ts` | Tables `visits` (membership check), `visit_care_notes`; `auth.getUser()` for `author_id` on insert |
| `api/visit-care-notes/[id]/route.ts` | Table `visit_care_notes` (update/delete by id + agency) |

---

## Other

| Route | Depends on |
|-------|------------|
| `api/health/route.ts` | None (optional `VERCEL_GIT_COMMIT_SHA`) |
