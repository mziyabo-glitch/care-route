# Production stabilisation audit

Last reviewed: 2026-05-19. **Supabase MCP verification** on project `care-route` (`avcjgqvwyadyuoandybr`) — see [RUN_MIGRATIONS.md live log](../../supabase/scripts/RUN_MIGRATIONS.md#live-verification-log-supabase-mcp).

**Production URL:** https://care-route-two.vercel.app (see root `README.md`)

**Status key:** **DONE** = complete in repo / documented · **PENDING** = operator must confirm or apply on live · **N/A** = not applicable to this pass

---

## Audit items (section A)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Live Supabase migrations applied | **DONE** (schema) / **N/A** (CLI history) | MCP 2026-05-19: all required tables/RPCs present; only gap was `geocoded_at` (applied). `list_migrations` empty — objects applied via SQL/bootstrap, not Supabase CLI tracking. |
| 2 | `NOTIFY pgrst, 'reload schema'` | **DONE** (live) | Ran after `client_geocoded_at` apply (2026-05-19 MCP). Re-run if PostgREST still stale. |
| 3 | `MVP_SCHEMA_CHECKLIST.md` verification | **DONE** (live spot-check) | MCP verified tables, RPCs, RLS for care + payroll + risk + map columns. UI smoke test still manual. |
| 4 | Vercel env vars | **DONE** (doc) / **PENDING** (live) | [`vercel-supabase-config.md`](./vercel-supabase-config.md): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, production URL. Also linked from [`RUN_MIGRATIONS.md`](../../supabase/scripts/RUN_MIGRATIONS.md). |
| 5 | Supabase auth redirect URLs | **DONE** (doc) / **PENDING** (live) | Production domain `https://care-route-two.vercel.app` — Site URL + `/auth/callback`, `/update-password` (and localhost dev). See [`vercel-supabase-config.md`](./vercel-supabase-config.md) and root `README.md` (no preview URLs for prod auth). |
| 6 | Smoke test checklist | **DONE** | Canonical: [`docs/PRODUCTION_SMOKE_TEST.md`](../PRODUCTION_SMOKE_TEST.md) (Repo ready vs Verified on production). Short form: [`production-smoke-test.md`](./production-smoke-test.md). |
| 7 | `bootstrap_prerequisites.sql` includes care plan / notes | **N/A** (not in bootstrap) / **DONE** (documented) | Grep: no `care_plans`, `care_plan_sections`, or `visit_care_notes` in bootstrap. Bootstrap covers agencies through payroll; operator must run incremental migrations from `20260226000000` onward ([`RUN_MIGRATIONS.md`](../../supabase/scripts/RUN_MIGRATIONS.md)). |
| 8 | `RUN_MIGRATIONS.md` migration order | **DONE** | [`supabase/scripts/RUN_MIGRATIONS.md`](../../supabase/scripts/RUN_MIGRATIONS.md) — full ordered list, bootstrap gap, NOTIFY, env pointer. |
| 9 | `getCurrentAgencyId()` multi-agency | **DONE** (documented) | `src/lib/agency.ts`: `.limit(1)` on `agency_members`, no `ORDER BY`. Same query in `(dashboard)/layout.tsx` for tenancy gate. No `getCurrentAgencyMembership` helper — duplicate inline membership fetch. Agency switcher not implemented. |

---

## Blockers (production readiness)

1. **Vercel env vars** — confirm on Vercel dashboard ([`vercel-supabase-config.md`](./vercel-supabase-config.md)).
2. **Supabase auth redirect URLs** — confirm Site URL + callbacks for `https://care-route-two.vercel.app`.
3. **Production smoke test** — run [`docs/PRODUCTION_SMOKE_TEST.md`](../PRODUCTION_SMOKE_TEST.md) on live app (not done via MCP).
4. **Multi-agency users** — first `agency_members` row wins; OK for single-agency MVP only.
5. **Confirm project identity** — only one Supabase project linked; assumed production `care-route`.

---

## Quick schema spot-checks (SQL Editor)

```sql
SELECT to_regclass('public.care_plans'),
       to_regclass('public.care_plan_sections'),
       to_regclass('public.visit_care_notes');
```

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clients'
  AND column_name IN ('geocoded_at', 'latitude', 'longitude');
```

```sql
SELECT proname FROM pg_proc
WHERE proname IN ('list_timesheets', 'check_in', 'list_visits_for_week', 'calculate_visit_risk')
ORDER BY 1;
```

Then: `NOTIFY pgrst, 'reload schema';`
