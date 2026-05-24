# Care Route — TODO

Production URL: **https://care-route-two.vercel.app**

Deploy + smoke: [docs/DEPLOY_AND_SMOKE.md](docs/DEPLOY_AND_SMOKE.md) · Full checklist: [docs/PRODUCTION_SMOKE_TEST.md](docs/PRODUCTION_SMOKE_TEST.md)

Checklists: [`docs/checklists/README.md`](docs/checklists/README.md)

---

## A. Production stabilisation (documentation + manual ops)

Repo-complete items are checked below. **Production** columns require manual verification on Supabase/Vercel.

| # | Item | Repo | Production |
|---|------|:----:|:----------:|
| 1 | All migrations through `20260228100100` applied | [x] | [x] schema verified 2026-05-19 (MCP); `geocoded_at` applied live |
| 2 | `NOTIFY pgrst, 'reload schema'` after migrations | [x] | [x] ran 2026-05-19 after `geocoded_at` |
| 3 | `MVP_SCHEMA_CHECKLIST.md` spot-check on live DB | [x] | [x] tables/RPCs/RLS 2026-05-19; UI smoke still manual |
| 4 | Vercel env vars set (see config doc) | [x] | [ ] |
| 5 | Supabase auth redirect URLs (prod domain only) | [x] | [ ] |
| 6 | Production smoke test completed | [x] | [ ] |
| 7 | `bootstrap_prerequisites.sql` gap understood (post-payroll migrations) | [x] | — |
| 8 | `RUN_MIGRATIONS.md` lists all 34 migrations | [x] | — |
| 9 | `getCurrentAgencyId()` limitation documented (not fixed) | [x] | — |

### Checkboxes (sync with audit)

- [x] **A1** Live Supabase schema aligned through `20260228100100` — **verified 2026-05-19** ([`RUN_MIGRATIONS.md` live log](supabase/scripts/RUN_MIGRATIONS.md#live-verification-log-supabase-mcp)); applied `20260228100000` for `geocoded_at`
- [x] **A2** `NOTIFY pgrst` — **ran 2026-05-19** on live after `geocoded_at`
- [x] **A3** `MVP_SCHEMA_CHECKLIST.md` DB spot-check — **2026-05-19**; app smoke test still manual
- [x] **A4** Vercel env vars documented — **repo** ([`docs/checklists/vercel-supabase-config.md`](docs/checklists/vercel-supabase-config.md)); confirm in Vercel — **manual**
- [x] **A5** Auth redirect URLs documented (README + config doc); confirm in Supabase — **manual confirm**
- [x] **A6** Smoke test checklist exists — **repo** ([`docs/PRODUCTION_SMOKE_TEST.md`](docs/PRODUCTION_SMOKE_TEST.md))
- [x] **A7** Bootstrap gap documented (no `care_plans` / `visit_care_notes` in bootstrap) — **repo**; run migrations after bootstrap — **manual**
- [x] **A8** `RUN_MIGRATIONS.md` migration order matches `supabase/migrations/` (34 files) — **repo**
- [x] **A9** `getCurrentAgencyId()` multi-agency limitation documented in `src/lib/agency.ts` — **repo** (not fixed; acceptable for single-agency MVP)

### Care planning + visit map (repo done; prod verify)

- [x] Care plans phases 1–4 code in repo ([`CARE_PLANNING_MVP.md`](CARE_PLANNING_MVP.md))
- [x] Visit map code + migrations in repo ([`docs/VISIT_MAP.md`](docs/VISIT_MAP.md))
- [x] Care plans + visit map schema on production — **2026-05-19 MCP**; [ ] UI smoke on https://care-route-two.vercel.app

### Out of scope (this pass)

- [x] **Phase 5 — Compliance dashboard** — implemented in repo; verify on production after A4–A6 smoke test

Audit detail: [`docs/checklists/production-stabilisation-audit.md`](docs/checklists/production-stabilisation-audit.md)

---

## B. Compliance dashboard (deferred)

See [`CARE_PLANNING_MVP.md`](CARE_PLANNING_MVP.md) Phase 5. Start only after section A production checks pass.

---

## C. Care planning polish

- [x] **C1** Care plan link from visits (modal + visit row → `/clients/[id]/care-plan`)
- [x] **C2** Default section templates on plan create (API POST)
- [x] **C3** Archive plan button + confirm; show create state after archive
- [x] **C4** Visit care notes modal: filter (all / general / handover / clinical / untagged) + author display
- [x] **C5** Docs updated (`CARE_PLANNING_MVP.md`, `MVP_SCHEMA_CHECKLIST.md`, `TODO.md`)
