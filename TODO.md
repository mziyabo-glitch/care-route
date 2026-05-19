# Care Route — TODO lists

Track progress by checking boxes. Based on repo audit @ `main` (see `MVP_SCHEMA_CHECKLIST.md`, `CARE_PLANNING_MVP.md`).

---

## A. Production stabilisation (do first)

### Database & deploy
- [ ] Apply all pending migrations on live Supabase (at minimum: `20260224000000`, `20260226000000`, `20260227000000`, `20260227100000`)
- [ ] Run `NOTIFY pgrst, 'reload schema';` in SQL Editor after migrations
- [ ] Verify each group in `MVP_SCHEMA_CHECKLIST.md` (RPCs + tables exist)
- [ ] Confirm Vercel env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
- [ ] Confirm Supabase auth redirect URLs use production domain only (see `README.md`)

### Smoke tests (manual)
- [ ] `/` redirects to `/login`
- [ ] Login → dashboard (no bounce back to login)
- [ ] Create client, carer, visit
- [ ] Check in / check out on a visit
- [ ] Adjust visit times (manager+)
- [ ] Generate payroll → approve → export CSV
- [ ] Billing summary loads for a date range
- [ ] Rota week loads; optional risk recalc
- [ ] Client care plan: create plan, add/edit/delete section
- [ ] Visit care notes: add, edit, delete note on a visit

### Code / ops hygiene
- [ ] Append `care_plans`, `care_plan_sections`, `visit_care_notes` to `bootstrap_prerequisites.sql` (if you use bootstrap for fresh DBs)
- [ ] Document “migration order” in `RUN_MIGRATIONS.md` (include care + notes migrations)
- [ ] Fix or document `getCurrentAgencyId()` when user belongs to multiple agencies

---

## B. Compliance dashboard (next product slice)

### Schema / API
- [ ] Add RPC or server query: visits with `status = 'missed'` in date range (agency-scoped)
- [ ] Add RPC or query: completed visits with **no** `visit_care_notes` row (define rule: e.g. after `end_time` + grace period)
- [ ] Optional: `GET /api/compliance` returning `{ missed_visits, visits_missing_notes }`

### UI
- [ ] Add route `(dashboard)/compliance/page.tsx`
- [ ] Add nav link (manager/owner+, same pattern as billing)
- [ ] Table: missed visits (client, carer, date, link to visit)
- [ ] Table: missing notes (client, visit time, link to visits / care notes modal)
- [ ] Date range filter (week default)

### Docs
- [ ] Update `CARE_PLANNING_MVP.md` — mark Phase C done when shipped
- [ ] Update `MVP_SCHEMA_CHECKLIST.md` with compliance API deps

---

## C. Care planning polish (optional, after compliance)

- [ ] Care plan: link from visit modal (“View client care plan”)
- [ ] Care plan: default section templates on create (e.g. needs, risks, medication)
- [ ] Care plan: archive flow + create new version (replace “one non-archived plan” rule in UI copy)
- [ ] Visit notes: filter by `note_type` in modal
- [ ] Visit notes: show `author_id` / email if available
- [ ] RPCs for care plans (security definer) if direct table access becomes painful

---

## D. Finance & ops hardening

- [ ] Payroll: empty-state messaging when RPC missing (already partial fallback on list)
- [ ] Billing: validate `list_billing_summary` on staging with real funder setup
- [ ] Audit log UI for owners (read `audit_logs` — table exists, no screen)
- [ ] Export billing summary CSV (if needed for LA invoicing)

---

## E. Quality & maintainability

- [ ] Add minimal API smoke tests (auth + one RPC per domain)
- [ ] Add GitHub Action: `npm run build` on PR
- [ ] Replace default Next.js metadata / favicon if still generic
- [ ] Carer mobile / field app (out of scope for web MVP — track separately)

---

## F. Not planned (explicitly out of scope for now)

- `visit_logs` as separate table (use `visit_actuals`)
- `billing_profiles` table (use funders + `billing_rates`)
- `visit_tasks` table
- Rich text editors for notes or care plans
- Expo / native app (this repo is Next.js web only)

---

## Quick reference — file map

| Area | Key paths |
|------|-----------|
| Migrations | `supabase/migrations/` |
| Bootstrap | `supabase/scripts/bootstrap_prerequisites.sql` |
| API | `src/app/api/**` |
| Dashboard UI | `src/app/(dashboard)/**` |
| Agency safety | `src/lib/agency.ts`, `*-data.ts` helpers |
| Schema checklist | `MVP_SCHEMA_CHECKLIST.md` |
| Care roadmap | `CARE_PLANNING_MVP.md` |
