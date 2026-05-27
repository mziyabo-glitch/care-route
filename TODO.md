# Care Route — TODO

Production URL: **[https://care-route-two.vercel.app](https://care-route-two.vercel.app)**

Deploy + smoke: [docs/DEPLOY_AND_SMOKE.md](docs/DEPLOY_AND_SMOKE.md) · Full checklist: [docs/PRODUCTION_SMOKE_TEST.md](docs/PRODUCTION_SMOKE_TEST.md)

Checklists: `[docs/checklists/README.md](docs/checklists/README.md)`

---

## A. Production stabilisation (documentation + manual ops) - **COMPLETE 2026-05-25** (re-checked 2026-05-27)

Repo-complete items are checked below. **Production** columns require manual verification on Supabase/Vercel.

### Re-verification 2026-05-27 (automated, no login)

| Check | Result |
| ----- | ------ |
| Deploy vs `origin/main` | **Match** — `/api/health` commit `ea5e073` = `origin/main` (`ea5e0738…`) |
| Public smoke | **Pass** — `/login` 200; `/` and dashboard routes 307 → `/login`; `/api/health` 200; no public 500s |
| Vercel env vars (dashboard) | **Not verified** — Vercel CLI not installed; infer `NEXT_PUBLIC_*` from live login page; `CRON_SECRET` likely set (cron returns 401, not 500) |
| Supabase auth URL config | **Not verified** — MCP has no auth-settings read; auth logs show `referer: care-route-two.vercel.app` with 200s |
| Full `PRODUCTION_SMOKE_TEST.md` | **Pending manual** — requires manager+ login (dashboard, payroll, billing, care plans, etc.) |

**User must confirm:** Vercel dashboard env vars (all four); Supabase Site URL + redirect allow-list; run full smoke while logged in after Section C deploy.


| #   | Item                                                                   | Repo | Production                                                       |
| --- | ---------------------------------------------------------------------- | ---- | ---------------------------------------------------------------- |
| 1   | All migrations through `20260228100100` applied                        | [x]  | [x] schema verified 2026-05-19 (MCP); `geocoded_at` applied live |
| 2   | `NOTIFY pgrst, 'reload schema'` after migrations                       | [x]  | [x] ran 2026-05-19 after `geocoded_at`                           |
| 3   | `MVP_SCHEMA_CHECKLIST.md` spot-check on live DB                        | [x]  | [x] tables/RPCs/RLS 2026-05-19; UI smoke still manual            |
| 4   | Vercel env vars set (see config doc)                                   | [x]  | [~] inferred 2026-05-27; dashboard confirm still needed          |
| 5   | Supabase auth redirect URLs (prod domain only)                         | [x]  | [~] logs OK 2026-05-27; dashboard confirm still needed         |
| 6   | Production smoke test completed                                        | [x]  | [~] public pass 2026-05-27; full smoke needs login (2026-05-25) |
| 7   | `bootstrap_prerequisites.sql` gap understood (post-payroll migrations) | [x]  | —                                                                |
| 8   | `RUN_MIGRATIONS.md` lists all 34 migrations                            | [x]  | —                                                                |
| 9   | `getCurrentAgencyId()` limitation documented (not fixed)               | [x]  | —                                                                |


### Checkboxes (sync with audit)

- **A1** Live Supabase schema aligned through `20260228100100` — **verified 2026-05-19** (`[RUN_MIGRATIONS.md` live log](supabase/scripts/RUN_MIGRATIONS.md#live-verification-log-supabase-mcp)); applied `20260228100000` for `geocoded_at`
- **A2** `NOTIFY pgrst` — **ran 2026-05-19** on live after `geocoded_at`
- **A3** `MVP_SCHEMA_CHECKLIST.md` DB spot-check — **2026-05-19**; app smoke test still manual
- **A4** Vercel env + auth production checks - **2026-05-25** (`[docs/checklists/vercel-supabase-config.md](docs/checklists/vercel-supabase-config.md)`)
- **A5** Production deployment verification (Vercel deploy + Supabase auth redirect URLs) - **2026-05-25**
- **A6** Production smoke test passed on [https://care-route-two.vercel.app](https://care-route-two.vercel.app) - **2026-05-25** (`[docs/PRODUCTION_SMOKE_TEST.md](docs/PRODUCTION_SMOKE_TEST.md)`)
- **A7** Bootstrap gap documented (no `care_plans` / `visit_care_notes` in bootstrap) — **repo**; run migrations after bootstrap — **manual**
- **A8** `RUN_MIGRATIONS.md` migration order matches `supabase/migrations/` (34 files) — **repo**
- **A9** `getCurrentAgencyId()` multi-agency limitation — **repo** (newest `agency_members.created_at` only; no switcher UI — removed 2026-05-26, see `docs/AGENCY_SWITCHER.md`)

### Care planning + visit map (repo done; prod verify)

- Care plans phases 1–4 code in repo (`[CARE_PLANNING_MVP.md](CARE_PLANNING_MVP.md)`)
- Visit map code + migrations in repo (`[docs/VISIT_MAP.md](docs/VISIT_MAP.md)`)
- Care plans + visit map schema on production — **2026-05-19 MCP**; [x] UI smoke on [https://care-route-two.vercel.app](https://care-route-two.vercel.app) - **2026-05-25**

### Out of scope (this pass)

- **Phase 5 - Compliance dashboard** - implemented in repo; verified on production **2026-05-25** (A6 smoke)

Audit detail: `[docs/checklists/production-stabilisation-audit.md](docs/checklists/production-stabilisation-audit.md)`

**Section A complete:** 2026-05-25

Production smoke used **Swindon Community Care Demo** seeded agency data (dashboard Swindon demo). Verified on [https://care-route-two.vercel.app](https://care-route-two.vercel.app): login, dashboard, clients, carers, visits, care plans, visit notes, visit map, compliance, payroll CSV, billing, rota.

---

## B. Compliance dashboard (deferred)

- **Phase 5 - Compliance dashboard** - implemented in repo; verified on production **2026-05-25** (A6 smoke)

---

## C. Care planning polish

- **C1** Care plan links from visits + client list polished (`View care plan` in visit row, visit details, care notes modal, client list)
- **C2** Default section templates extended (Mobility, Nutrition / Hydration) for new plan creation API
- **C3** Archive flow hardened: archived plan read-only in API + UI, archived plan history view, audit/history copy
- **C4** Visit notes UX improved: note-type filter (including risk/safeguarding), newest-first, author display, highlighted risk/safeguarding notes
- **C5** Operational visit UX: visit details modal timeline, scheduled vs actual durations, missing-note and GPS warnings, late/missed/double-up badges
- **C6** Compliance + map UX: compliance deep-link to specific visit and quick “Add care note”; visit map “Only show issues” filter + expanded legend
- **C7** Docs updated (`CARE_PLANNING_MVP.md`, `MVP_SCHEMA_CHECKLIST.md`, `TODO.md`)

