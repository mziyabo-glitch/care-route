# Production smoke test (short)

**Canonical checklist:** [`docs/PRODUCTION_SMOKE_TEST.md`](../PRODUCTION_SMOKE_TEST.md)  
**Deploy:** [`docs/DEPLOY_AND_SMOKE.md`](../DEPLOY_AND_SMOKE.md)

Run on **https://care-route-two.vercel.app** after migrations and env/auth setup.

## Quick pass

- [ ] Auth: `/` -> login -> dashboard
- [ ] Core: client, carer, visit; check-in/out; manager adjust times; rota week
- [ ] Payroll + billing summary
- [ ] Care plan CRUD + **Section C:** templates on create, archive, link from Visits
- [ ] Visit notes: filter + author; CRUD
- [ ] Compliance page (if in deploy)
- [ ] Visit map (manager+)

On failure: [`supabase/scripts/RUN_MIGRATIONS.md`](../../supabase/scripts/RUN_MIGRATIONS.md) + `NOTIFY pgrst, 'reload schema';`