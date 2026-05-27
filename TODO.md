# Care Route — TODO

Production URL: **[https://care-route-two.vercel.app](https://care-route-two.vercel.app)**

Deploy + smoke: [docs/DEPLOY_AND_SMOKE.md](docs/DEPLOY_AND_SMOKE.md) · Full checklist: [docs/PRODUCTION_SMOKE_TEST.md](docs/PRODUCTION_SMOKE_TEST.md)

Checklists: `[docs/checklists/README.md](docs/checklists/README.md)`

---

## A. Production stabilisation — **PARTIAL** (re-verified 2026-05-27)

Public smoke **pass**. Full manager+ smoke and dashboard env confirmation **still manual**.

| Check | Result |
| ----- | ------ |
| Deploy vs `origin/main` | **Match** — `/api/health` commit `ea5e073` = `origin/main` (local `HEAD` may be ahead until pushed) |
| Public smoke | **Pass** — `/login` 200; `/`, `/dashboard`, `/compliance`, `/clients`, `/visits` redirect unauthenticated users (307 → `/login`); `/api/health` 200 |
| Vercel env vars | **Manual** — Vercel CLI not installed. Confirm in dashboard: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (names only; do not log values). `NEXT_PUBLIC_*` inferred from live app; cron route returns 401 without secret (suggests `CRON_SECRET` set). |
| Supabase Auth URLs | **Manual** — MCP cannot read auth settings. Expected Site URL: `https://care-route-two.vercel.app`; redirect allow-list must include production. |
| Full `PRODUCTION_SMOKE_TEST.md` | **Pending** — requires manager+ login after new migrations deployed |

**Section A complete:** No — public checks pass; logged-in smoke + env dashboard confirmation outstanding.

---

## B. CQC compliance MVP — **REPO COMPLETE** (deploy + smoke pending)

- [x] `cqc_evidence_items` migration + RLS (`20260527100000_cqc_evidence_items.sql`)
- [x] Server helper `src/lib/cqc-evidence-data.ts`
- [x] API `/api/cqc-evidence`, `/api/cqc-evidence/[id]`
- [x] Compliance UI: category cards, counts, add form, badges, recently completed
- [x] [docs/CQC_COMPLIANCE_MVP.md](docs/CQC_COMPLIANCE_MVP.md)
- [ ] Apply migrations on production + `NOTIFY pgrst, 'reload schema';`
- [ ] Manager+ smoke: create evidence item on `/compliance`

---

## C. Care plans MVP — **REPO COMPLETE** (deploy + smoke pending)

- [x] Domiciliary default sections (12 templates incl. confidential)
- [x] Review fields migration (`20260527100100_care_plans_review_confidentiality.sql`)
- [x] UI: status, review due, overdue highlight, mark reviewed, confidential section grouping
- [x] Overdue reviews on compliance dashboard
- [x] [docs/CARE_PLANS_MVP.md](docs/CARE_PLANS_MVP.md) · [CARE_PLANNING_MVP.md](CARE_PLANNING_MVP.md) updated
- [ ] Production migration + logged-in smoke (create plan, mark reviewed, overdue tile)

---

## D. Confidentiality and access — **REPO COMPLETE** (verify with carer account)

- [x] `carer` role in `src/lib/roles.ts` + nav restrictions (hide payroll, billing, compliance, carers list)
- [x] RLS: assigned visits/clients; restricted sections manager+; care plan writes manager+ (`20260527100200_confidentiality_rls.sql`)
- [x] UI badges + notice (`src/app/components/confidentiality-badges.tsx`)
- [x] [docs/CONFIDENTIALITY_AND_ACCESS.md](docs/CONFIDENTIALITY_AND_ACCESS.md)
- [ ] Manual: carer cannot see payroll/billing/compliance; cannot read restricted sections
- [ ] Future: `audit_logs` UI for care plan / note changes

---

## E. Demo seed (Swindon Care Demo Agency) — **REPO COMPLETE**

- [x] Scenario seed: 10 clients, 6 carers, CQC evidence, care plans, visits (`scripts/seed-swindon-demo-agency.ts`)
- [x] [docs/DEMO_SEED_SWINDON.md](docs/DEMO_SEED_SWINDON.md) — audit, scenario table, runbook
- [ ] Apply migrations on target DB + run `ALLOW_DEMO_SEED=true npm run seed:swindon-demo`
- [ ] Manual smoke: dashboard, compliance, care plans, confidentiality (carer account)

---

## F. Care Control Centre dashboard — **REPO COMPLETE** (2026-05-27)

- [x] Redesign landing page: hero, safety status, priority actions (top 5), Now/Next/Later timeline, CQC readiness strip, care plan reviews, confidentiality panel
- [x] `loadDashboardData` extended: CQC category counts, care plan review stats, restricted section count — no note/plan bodies
- [x] [docs/DASHBOARD_DATA_AUDIT.md](docs/DASHBOARD_DATA_AUDIT.md) · [docs/DASHBOARD_COMPLIANCE_METRICS.md](docs/DASHBOARD_COMPLIANCE_METRICS.md)
- [ ] Production migration + logged-in smoke (manager+ and carer roles)

---

## Known gaps (unchanged)

- Multi-agency `getCurrentAgencyId()` — newest membership only ([docs/AGENCY_SWITCHER.md](docs/AGENCY_SWITCHER.md))
- Demo: no `preferred_name` / DOB / emergency contact columns — stored in `clients.notes` until schema extended
- Demo: Sarah Coordinator has no separate auth user (carer/manager record only)
- No automated late-visit compliance rule
- `audit_logs` not surfaced in UI
