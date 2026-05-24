# Deploy and production smoke test

**App URL:** https://care-route-two.vercel.app  
**Supabase project:** care-route (`avcjgqvwyadyuoandybr`)

## Deploy

1. Merge or push to **`main`** on GitHub.
2. Vercel auto-deploys the production app (care-route-two).
3. Confirm the deployment succeeded in the Vercel dashboard.

## Before smoke test (manual)

1. **Vercel environment variables** - see [`docs/checklists/vercel-supabase-config.md`](checklists/vercel-supabase-config.md).
2. **Supabase Auth redirect URLs** - production site URL only (same doc).
3. **Database** - migrations through `20260228100100_visit_actuals_gps.sql` already applied on live (verified 2026-05-19). Do not re-run destructive SQL. After any future migration: `NOTIFY pgrst, 'reload schema';` per [`supabase/scripts/RUN_MIGRATIONS.md`](../supabase/scripts/RUN_MIGRATIONS.md).

## Smoke test

Work through every checkbox in [`docs/PRODUCTION_SMOKE_TEST.md`](PRODUCTION_SMOKE_TEST.md), including **Section C** (care plan templates, archive, visits link) and **Compliance / Visit map** if those routes are in the deployed build.

Record pass/fail and date on the checklist or in [`TODO.md`](../TODO.md) (A4-A6 production columns).

## If something fails

- Schema/RPC errors: migrations + PostgREST reload (see `RUN_MIGRATIONS.md`).
- Auth redirect loops: Supabase URL config + Vercel `NEXT_PUBLIC_*` URLs.
- 403 on manager routes: agency role membership in Supabase.