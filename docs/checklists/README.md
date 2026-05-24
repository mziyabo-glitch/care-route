# Production checklists (Care Route)

Use before/after each production deploy.

| Checklist | Purpose |
|-----------|---------|
| [production-stabilisation-audit.md](./production-stabilisation-audit.md) | Migration, schema, env, auth, and code-readiness audit |
| [production-smoke-test.md](./production-smoke-test.md) | Manual smoke test (alias; canonical: [`../PRODUCTION_SMOKE_TEST.md`](../PRODUCTION_SMOKE_TEST.md)) |
| [vercel-supabase-config.md](./vercel-supabase-config.md) | Vercel env vars and Supabase auth redirect URLs |

Related repo docs:

- Stabilisation TODO: [`TODO.md`](../../TODO.md) section A
- Schema ↔ API map: [`MVP_SCHEMA_CHECKLIST.md`](../../MVP_SCHEMA_CHECKLIST.md) (repo root)
- Care planning slices: [`CARE_PLANNING_MVP.md`](../../CARE_PLANNING_MVP.md)
- SQL apply order: [`supabase/scripts/RUN_MIGRATIONS.md`](../../supabase/scripts/RUN_MIGRATIONS.md)
- Production smoke test: [`docs/PRODUCTION_SMOKE_TEST.md`](../PRODUCTION_SMOKE_TEST.md)
