# Production smoke test

Run on **https://care-route-two.vercel.app** after deploy and after all Supabase migrations through `20260228100100_visit_actuals_gps.sql`.

**Prerequisites:** migrations applied, `NOTIFY pgrst, 'reload schema';` run, Vercel env vars and Supabase auth URLs configured ([`docs/checklists/vercel-supabase-config.md`](checklists/vercel-supabase-config.md)).

Sign in as **manager+** (owner/admin) unless noted. Record pass/fail and date.

Deploy steps: [`docs/DEPLOY_AND_SMOKE.md`](DEPLOY_AND_SMOKE.md).

---

## Demo seed — expected state

Run `npm run seed:swindon-demo` (with `ALLOW_DEMO_SEED=true`) before testing demo flows.

| Check | Expected |
|-------|----------|
| Agency | Swindon Community Care Demo |
| Clients | 40 |
| Carers | 30 |
| Visits | 168 |
| Funder | Swindon Demo LA |

**After reseeding:** sign out then sign back in. The seed bumps the demo membership's `created_at` to `now()` so `getCurrentAgencyId()` resolves to Swindon on the next login. There is no agency switcher UI — resolution is deterministic via newest `created_at`.

**Expected smoke path:**

- [ ] Dashboard shows Swindon agency name and visit counts
- [ ] Visits page: 168 visits, mixed statuses
- [ ] Care plans: open any client → Care Plan tab — sections present
- [ ] Visit notes: some visits have notes; gaps visible for compliance
- [ ] Visit map: pins in SN* postcode area with GPS actuals
- [ ] Compliance: missed visits and notes-gap flags visible
- [ ] Payroll: generate CSV for 14-day window — downloads successfully
- [ ] Billing: `/billing/summary` loads without errors

---

## Auth and routing

- [ ] `/` redirects to `/login`
- [ ] Login (email/password) reaches `/dashboard`
- [ ] Signed-out user cannot access dashboard routes

---

## Core data entry

- [ ] Create **client** - appears in list
- [ ] Create **carer** - appears in list
- [ ] Create **visit** for client + carer - appears on Visits

---

## Visit lifecycle

- [ ] **Check-in** on a visit - time persists after refresh
- [ ] **Check-out** on a visit - time persists after refresh
- [ ] **Manager adjust visit times** - adjustment saved; visible in UI if exposed

---

## Payroll

- [ ] Payroll page loads (no `list_timesheets` / schema errors)
- [ ] **Generate** timesheet for a date range
- [ ] **Approve** timesheet
- [ ] **Export CSV** - file downloads with expected rows

---

## Billing

- [ ] **Billing summary** loads for a date range (manager+)
- [ ] No RPC/schema errors on billing views

---

## Rota

- [ ] **Rota week** view loads; visits visible for selected week

---

## Care plans

- [ ] Open client **Care plan** (`/clients/[id]/care-plan`)
- [ ] **Create / read / update** plan metadata (status, dates)
- [ ] **CRUD sections** - add, edit title/body; changes persist after refresh

### Section C (care planning polish)

- [ ] **Create care plan** - default section templates appear on create (not an empty plan)
- [ ] **Archive plan** - confirm dialog; after archive, UI shows create-new plan state
- [ ] **View care plan from Visits** - visit row or notes modal links to `/clients/[id]/care-plan`

---

## Visit care notes

- [ ] Add care note on a visit (modal or detail)
- [ ] **Filter** notes (all / general / handover / clinical / untagged)
- [ ] **Author** displayed on each note
- [ ] **Edit / delete** note if UI exposes it
- [ ] Notes persist after refresh

---

## Compliance (if deployed)

- [ ] Nav shows **Compliance** for manager / admin / owner
- [ ] `/compliance` loads without RPC/schema errors

See [`docs/COMPLIANCE.md`](COMPLIANCE.md).

---

## Visit map (manager+)

- [ ] Nav shows **Visit map** for manager / admin / owner
- [ ] `/visit-map` loads (pins or fallback table)
- [ ] Date filter works; no 403 for allowed role
- [ ] Carer-only user does not get map access (hidden or 403)

See [`docs/VISIT_MAP.md`](VISIT_MAP.md).

---

## Post-test

- [ ] No blocking console errors on primary flows
- [ ] If schema/RPC errors: apply migrations + `NOTIFY pgrst, 'reload schema';` ([`supabase/scripts/RUN_MIGRATIONS.md`](../supabase/scripts/RUN_MIGRATIONS.md))

Duplicate checklist (summary): [`docs/checklists/production-smoke-test.md`](checklists/production-smoke-test.md)