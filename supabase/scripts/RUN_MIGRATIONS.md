# Run Supabase migrations (production / staging)

Apply SQL in **filename order** on live Supabase (SQL Editor, one file at a time, or paste combined batches). After **any** migration batch, run:

```sql
NOTIFY pgrst, 'reload schema';
```

(`bootstrap_prerequisites.sql` and individual migration files that end with this NOTIFY already include it; run it again if unsure.)

For a **fresh** database, you may run `supabase/scripts/bootstrap_prerequisites.sql` once instead of every file below — it inlines migrations through payroll, care plans, and visit care notes. It does **not** include `20260226000000_visit_risk_engine.sql`; apply that migration separately if you need risk scoring.

---

## Migration order (chronological)

Run each file under `supabase/migrations/` in this order:

1. `20260217213000_multi_tenant_agencies.sql`
2. `20260217223000_fix_agency_rls_recursion.sql`
3. `20260218000000_clients_carers_visits.sql`
4. `20260218100000_clients_address_notes.sql`
5. `20260218110000_carers_role_active.sql`
6. `20260218120000_carers_insert_rpc.sql`
7. `20260218133000_clients_insert_rpc.sql`
8. `20260218140000_list_rpcs.sql`
9. `20260218150000_counts_deletes_rls.sql`
10. `20260218160000_visits_schema_rpcs.sql`
11. `20260218170000_rota_list_visits_for_week.sql`
12. `20260218180000_visit_conflict_check.sql`
13. `20260218190000_visit_assignments.sql`
14. `20260218190000_visit_assignments_travel.sql`
15. `20260218200000_joint_visits_rpcs.sql`
16. `20260218200000_travel_estimate.sql`
17. `20260218210000_fix_update_visit_params.sql`
18. `20260218220000_fix_update_visit_param_defaults.sql`
19. `20260218230000_requires_double_up.sql`
20. `20260218240000_invites_and_roles.sql`
21. `20260218250000_travel_geolocation.sql`
22. `20260219120000_geocode_rpc.sql`
23. `20260220000000_swap_visit_times.sql`
24. `20260220100000_carer_role_rls.sql`
25. `20260221000000_funding_billing.sql`
26. `20260221100000_update_client_rpc.sql`
27. `20260222000000_funders_rates_billing.sql`
28. `20260223000000_role_billing_rates.sql`
29. `20260224000000_visit_actuals_payroll.sql` — visit actuals, timesheets, check-in/out RPCs
30. `20260226000000_visit_risk_engine.sql` — `visit_risk_scores`, `calculate_visit_risk`, rota risk RPCs
31. `20260227000000_care_plans.sql` — `care_plans`, `care_plan_sections`
32. `20260227100000_visit_care_notes.sql` — `visit_care_notes`

---

## Production Supabase steps

1. Open [supabase.com](https://supabase.com) → your project → **SQL Editor**.
2. For each migration file not yet applied (compare with your DB; see verification below), paste the full file contents and **Run**.
3. If a migration fails with “already exists”, the object may be partially applied — fix manually or skip idempotent sections; do not re-run destructive blocks blindly.
4. After the last new migration (or after a batch), run:

   ```sql
   NOTIFY pgrst, 'reload schema';
   ```

5. Confirm Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (for risk cron).
6. Confirm Supabase **Auth → URL configuration** redirect URLs use the production domain only (see root `README.md`).

### Minimum catch-up (if production lags MVP care + payroll)

If core schema exists but care/payroll/risk are missing, apply at least (in order):

- `20260224000000_visit_actuals_payroll.sql`
- `20260226000000_visit_risk_engine.sql` (optional if you do not use risk UI/cron yet)
- `20260227000000_care_plans.sql`
- `20260227100000_visit_care_notes.sql`

Then `NOTIFY pgrst, 'reload schema';`.

---

## Verification checklist

Use `MVP_SCHEMA_CHECKLIST.md` for route-level detail. Quick SQL checks in SQL Editor:

| Group | Check |
|-------|--------|
| **Auth / tenancy** | `SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('get_my_role','list_agency_members','accept_invite');` |
| **Clients / carers / visits** | RPCs: `insert_visit`, `update_visit`, `list_clients`, `insert_client`; table `visits` |
| **Rota** | RPCs: `list_visits_for_week`, `swap_visit_times`, `lookup_travel_cache` |
| **Check-in / payroll** | Tables: `visit_actuals`, `timesheets`, `timesheet_lines`; RPCs: `check_in`, `check_out`, `list_timesheets`, `generate_timesheet` |
| **Billing** | RPCs: `list_billing_summary`, `list_funders`; tables: `funders`, `billing_rates` |
| **Risk** | Table `visit_risk_scores`; RPCs: `calculate_visit_risk`, `get_visit_risk`, `recalculate_visit_risk_for_range` |
| **Care plans** | Tables: `care_plans`, `care_plan_sections` |
| **Visit care notes** | Table `visit_care_notes` |

Example table existence:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'care_plans', 'care_plan_sections', 'visit_care_notes',
    'visit_actuals', 'visit_risk_scores', 'timesheets'
  )
ORDER BY table_name;
```

---

## Multi-agency users

`getCurrentAgencyId()` in `src/lib/agency.ts` returns the **first** `agency_members` row for the logged-in user (`limit(1)` with no `ORDER BY`). Users in multiple agencies may see an arbitrary agency in the UI/API. MVP assumes one agency per user; do not pass `agency_id` from the client — always resolve server-side. See JSDoc on `getCurrentAgencyId()` / `getCurrentAgencyMembership()`.

---

## Local app

```bash
npm run dev    # development server
npm run build  # production compile check
```

---

## Troubleshooting

- **Could not find the function `public.list_timesheets`** (or similar): payroll migration not applied — run `20260224000000_visit_actuals_payroll.sql`, then `NOTIFY pgrst, 'reload schema';`.
- **Table public.visits does not exist**: run earlier migrations or full `bootstrap_prerequisites.sql` on a fresh DB.
- **Care plan / notes API errors**: confirm `20260227000000` and `20260227100000` applied and schema cache reloaded.
