# Dashboard data path audit

**Date:** 2026-05-26  
**Scope:** Care Control Centre landing page (`src/app/(dashboard)/dashboard/`), `src/lib/dashboard-data.ts`, and direct dependencies used only on that path.

**Disclaimer:** Engineering security review — not legal or CQC certification.

---

## Agency resolution

| Check | Status | Notes |
|-------|--------|-------|
| `getCurrentAgencyId()` on server | OK | `src/lib/agency.ts` — newest `agency_members.created_at DESC`, never client input |
| Page bails if no agency | OK | `page.tsx` returns `null` (layout already redirects to onboarding) |
| No agency switcher | OK | By product design |

---

## Data loaders and RPCs

| Source | Agency scoping | Membership check |
|--------|----------------|------------------|
| `agencies.select` | `.eq("id", agencyId)` | RLS + prior membership resolution |
| `count_carers` RPC | `p_agency_id` | SECURITY DEFINER checks `agency_members` |
| `list_visits_for_week` RPC | `p_agency_id` | Same |
| `visit_actuals` | `.eq("agency_id", agencyId)` | RLS |
| `visit_care_notes` (via `getComplianceIssues`) | `.eq("agency_id", agencyId)` | RLS |
| `getVisitMapRows` / `getComplianceIssues` | Passes resolved `agencyId` | Documented in lib headers |
| `list_billing_for_range` RPC | `p_agency_id` | Role + membership inside RPC |

**No unscoped queries** on the dashboard path: every table read includes `agency_id` from `getCurrentAgencyId()` or goes through an RPC that validates membership.

---

## Client trust boundaries

| Anti-pattern | Dashboard path |
|--------------|------------------|
| Client-supplied `agency_id` | **Not used** |
| Service role Supabase client | **Not used** — `createClient()` from `@/lib/supabase/server` (anon + user JWT) |
| Logging care note bodies / visit notes | **Not present** — task labels truncate `visits.notes` for display only; no `console.log` of clinical text |

---

## Role-gated sections

| Section | Gate | Behaviour if denied |
|---------|------|---------------------|
| Compliance pulse (tracked tiles) | `canAccessCompliance` (manager+) | Metrics hidden (`tracked: false`) for viewers |
| Payroll snapshot | `owner` / `admin` | Payroll hours tile omitted |
| Billing + visit map preview | `canEdit` (manager+) | Section hidden for viewers |
| Billing RPC | RPC raises if not manager+ | Caught by role gate before call |

---

## Issues found and disposition

| Issue | Severity | Action |
|-------|----------|--------|
| None critical on dashboard path | — | — |
| `agencies` direct select | Low | Acceptable: RLS limits to member agencies; only `name` selected |
| Payroll minutes computed server-side | Info | Mirrors `generate_timesheet` duration logic; not a separate RPC — documented in `DASHBOARD_COMPLIANCE_METRICS.md` |

---

## Recommendations (dashboard-only)

1. Keep new dashboard queries behind `loadDashboardData()` — single audit surface.
2. Code review checklist: any new tile must use `getCurrentAgencyId()` + existing RPC or `.eq("agency_id", …)`.
3. Do not add client-side fetches that accept `agency_id` query params.

---

## Files reviewed

- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/dashboard-view.tsx`
- `src/lib/dashboard-data.ts`
- `src/lib/agency.ts`
- `src/lib/compliance-data.ts`
- `src/lib/visit-map-data.ts`
- `src/lib/permissions.ts`
