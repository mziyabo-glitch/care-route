# Run Supabase migrations (Care Route)

If you see **"Could not find the function `public.list_timesheets`"** or similar schema errors, your Supabase database needs migrations applied.

**Related:** [`docs/checklists/production-stabilisation-audit.md`](../../docs/checklists/production-stabilisation-audit.md) · [`MVP_SCHEMA_CHECKLIST.md`](../../MVP_SCHEMA_CHECKLIST.md) · [`docs/PRODUCTION_SMOKE_TEST.md`](../../docs/PRODUCTION_SMOKE_TEST.md) · [`TODO.md`](../../TODO.md) section A

---

## After migrations: Vercel env and Supabase auth

These cannot be verified from the repo — configure on hosting:

| Topic | Doc |
|-------|-----|
| Vercel env vars (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`) | [`docs/checklists/vercel-supabase-config.md`](../../docs/checklists/vercel-supabase-config.md) |
| Supabase auth redirect URLs (production domain only) | Same doc + root [`README.md`](../../README.md) |

**Production app URL:** `https://care-route-two.vercel.app` — use this domain for Site URL and `/auth/callback`, `/update-password` redirects. Do not use Vercel preview URLs for production auth.

---

## PostgREST: `NOTIFY pgrst, 'reload schema'`

PostgREST caches the schema. After applying migrations (especially new tables/RPCs), reload the cache.

**When to run:** After the last migration in a batch, or any time you see "function not found" / stale schema errors despite objects existing in SQL.

**How:**

```sql
NOTIFY pgrst, 'reload schema';
```

**Already in migration files** (still safe to run again manually):

- `20260226000000_visit_risk_engine.sql`
- `20260227000000_care_plans.sql`
- `20260227100000_visit_care_notes.sql`

Migrations `20260228100000_client_geocoded_at.sql` and `20260228100100_visit_actuals_gps.sql` do **not** include NOTIFY — run the statement once after applying them.

---

## Recommended: Supabase CLI

From repo root (linked project):

```bash
npx supabase db push
```

Then run `NOTIFY pgrst, 'reload schema';` in SQL Editor (see section above).

---

## Manual: SQL Editor

1. Go to [supabase.com](https://supabase.com) → **care-route** project → **SQL Editor**
2. Run files in **filename order** below (each file once)
3. After the last file (or any batch of RPC/table changes), run:

```sql
NOTIFY pgrst, 'reload schema';
```

**Windows shortcut (payroll only):** `npm run migrate:copy` copies `20260224000000_visit_actuals_payroll.sql` to clipboard.

---

## Step 0: Fresh database (bootstrap only)

Use only when core tables are missing (e.g. `Table public.visits does not exist`).

1. Open `supabase/scripts/bootstrap_prerequisites.sql`
2. Copy entire file → SQL Editor → **Run**
3. Continue with incremental migrations from the list below that are **not** already covered by bootstrap

**Bootstrap includes:** agencies, clients, carers, visits, rota/travel RPCs, billing, payroll (`visit_actuals`, timesheets, etc.).

**Bootstrap does NOT include** (run migrations after bootstrap):

- [ ] `20260226000000_visit_risk_engine.sql`
- [ ] `20260227000000_care_plans.sql`
- [ ] `20260227100000_visit_care_notes.sql`
- [ ] `20260228100000_client_geocoded_at.sql`
- [ ] `20260228100100_visit_actuals_gps.sql`

---

## Migration order (apply in this sequence)

Check each when applied to **production**:

- [ ] `20260217213000_multi_tenant_agencies.sql`
- [ ] `20260217223000_fix_agency_rls_recursion.sql`
- [ ] `20260218000000_clients_carers_visits.sql`
- [ ] `20260218100000_clients_address_notes.sql`
- [ ] `20260218110000_carers_role_active.sql`
- [ ] `20260218120000_carers_insert_rpc.sql`
- [ ] `20260218133000_clients_insert_rpc.sql`
- [ ] `20260218140000_list_rpcs.sql`
- [ ] `20260218150000_counts_deletes_rls.sql`
- [ ] `20260218160000_visits_schema_rpcs.sql`
- [ ] `20260218170000_rota_list_visits_for_week.sql`
- [ ] `20260218180000_visit_conflict_check.sql`
- [ ] `20260218190000_visit_assignments.sql`
- [ ] `20260218190000_visit_assignments_travel.sql`
- [ ] `20260218200000_joint_visits_rpcs.sql`
- [ ] `20260218200000_travel_estimate.sql`
- [ ] `20260218210000_fix_update_visit_params.sql`
- [ ] `20260218220000_fix_update_visit_param_defaults.sql`
- [ ] `20260218230000_requires_double_up.sql`
- [ ] `20260218240000_invites_and_roles.sql`
- [ ] `20260218250000_travel_geolocation.sql`
- [ ] `20260219120000_geocode_rpc.sql`
- [ ] `20260220000000_swap_visit_times.sql`
- [ ] `20260220100000_carer_role_rls.sql`
- [ ] `20260221000000_funding_billing.sql`
- [ ] `20260221100000_update_client_rpc.sql`
- [ ] `20260222000000_funders_rates_billing.sql`
- [ ] `20260223000000_role_billing_rates.sql`
- [ ] `20260224000000_visit_actuals_payroll.sql`
- [ ] `20260226000000_visit_risk_engine.sql` — includes `NOTIFY pgrst`
- [ ] `20260227000000_care_plans.sql` — includes `NOTIFY pgrst`
- [ ] `20260227100000_visit_care_notes.sql` — includes `NOTIFY pgrst`
- [ ] `20260228100000_client_geocoded_at.sql` — visit map: `clients.geocoded_at`; no embedded `NOTIFY`
- [ ] `20260228100100_visit_actuals_gps.sql` — visit map: GPS cols on `visit_actuals`; no embedded `NOTIFY`

After applying the two visit-map files (or any manual SQL batch), run in SQL Editor:

```sql
NOTIFY pgrst, 'reload schema';
```

Migrations that **already include** `NOTIFY pgrst` at end of file: `20260226000000`, `20260227000000`, `20260227100000`.

---

## Verify (schema)

- [ ] Payroll page loads without `list_timesheets` error
- [ ] Care plan page loads; `care_plans` / `care_plan_sections` exist
- [ ] Visit care notes save on a visit
- [ ] Visit map: `clients.geocoded_at` column exists; optional GPS cols on `visit_actuals`
- [ ] `NOTIFY pgrst, 'reload schema';` run after final migration
- [ ] Spot-check [`MVP_SCHEMA_CHECKLIST.md`](../../MVP_SCHEMA_CHECKLIST.md)

## Verify (production smoke test)

After deploy, run the full UI checklist: [`docs/PRODUCTION_SMOKE_TEST.md`](../../docs/PRODUCTION_SMOKE_TEST.md)

---


## Legacy note (payroll-only quick fix)

The original short guide targeted only `20260224000000_visit_actuals_payroll.sql`. Production stabilisation requires **all** migrations through `20260228100100` for care plans, visit notes, visit map, and risk engine.

---

## Live verification log (Supabase MCP)

**Date:** 2026-05-19  
**Connected project:** `care-route` (`avcjgqvwyadyuoandybr`, `https://avcjgqvwyadyuoandybr.supabase.co`)  
**Only project in account** — treat as **production** unless you use a separate Supabase org for staging. Confirm with team before destructive changes.

| Check | Result |
|-------|--------|
| `supabase_migrations.schema_migrations` via MCP `list_migrations` | Empty (schema applied via SQL Editor/bootstrap, not CLI history) |
| Tables: `care_plans`, `care_plan_sections`, `visit_care_notes` | Present |
| `clients.latitude`, `longitude` | Present |
| `clients.geocoded_at` | **Was missing** → applied repo file `20260228100000_client_geocoded_at.sql` via MCP `apply_migration` |
| `visit_actuals` GPS columns | Present (`check_in/out_latitude/longitude`) |
| Core RPCs in `MVP_SCHEMA_CHECKLIST.md` | Present (spot-check 30+ names) |
| RLS on care tables + `visit_care_notes` | Policies present (SELECT/INSERT/UPDATE/DELETE) |
| Extra tables not in repo migrations | `availability`, `carer_users`, `profiles`, `shifts` (legacy; harmless) |

**SQL applied on live (this session):**

1. `apply_migration` **client_geocoded_at** — contents of `20260228100000_client_geocoded_at.sql`
2. `NOTIFY pgrst, 'reload schema';`

**Not applied (already on live):** `20260228100100_visit_actuals_gps.sql` (columns already exist).

**Still manual (not verifiable via DB):** Vercel env vars, Supabase auth redirect URLs, full [`docs/PRODUCTION_SMOKE_TEST.md`](../../docs/PRODUCTION_SMOKE_TEST.md) on https://care-route-two.vercel.app
