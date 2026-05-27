# Dashboard data path audit

**Date:** 2026-05-27  
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
| `list_visits_for_week` RPC | `p_agency_id` | SECURITY DEFINER checks `agency_members` |
| `visit_actuals` | `.eq("agency_id", agencyId)` | RLS |
| `visit_care_notes` (via `getComplianceIssues`) | `.eq("agency_id", agencyId)` | RLS — existence only, **no note body** |
| `getVisitMapRows` / `getComplianceIssues` | Passes resolved `agencyId` | Documented in lib headers |
| `care_plans` (review stats) | `.eq("agency_id", agencyId)` | RLS |
| `cqc_evidence_items` | `.eq("agency_id", agencyId)` | RLS — counts only on dashboard |
| `care_plan_sections` (restricted count) | `.eq("agency_id", agencyId)` + `confidentiality_level` | RLS — **count only**, no section body |

**No unscoped queries** on the dashboard path: every table read includes `agency_id` from `getCurrentAgencyId()` or goes through an RPC that validates membership.

---

## Client trust boundaries

| Anti-pattern | Dashboard path |
|--------------|------------------|
| Client-supplied `agency_id` | **Not used** |
| Service role Supabase client | **Not used** — `createClient()` from `@/lib/supabase/server` (anon + user JWT) |
| Care note / visit note bodies on dashboard | **Not present** — task labels fixed to `"Care visit"`; no `visit_care_notes.body` or `care_plan_sections.body` |
| CQC evidence descriptions | **Not present** — category counts only |
| Logging clinical text | **Not present** — no `console.log` of note or plan content |

---

## Role-gated sections

| Section | Gate | Behaviour if denied |
|---------|------|---------------------|
| CQC readiness strip | `canAccessCompliance` (manager+) | Section hidden |
| Care plan review stats + top overdue | `canAccessCompliance` (manager+) | Section hidden; safety tile for overdue plans hidden |
| High-risk CQC safety tile | `canAccessCompliance` | Hidden for viewers/carers |
| Confidentiality restricted count | All authenticated roles | Count only; carers see notice that restricted sections are not shown to their role |

---

## Issues found and disposition

| Issue | Severity | Action |
|-------|----------|--------|
| None critical on dashboard path | — | — |
| `agencies` direct select | Low | Acceptable: RLS limits to member agencies; only `name` selected |
| Restricted section count visible to carers | Info | Count only — no titles or bodies; aligns with transparency without disclosure |

---

## Recommendations (dashboard-only)

1. Keep new dashboard queries behind `loadDashboardData()` — single audit surface.
2. Code review checklist: any new tile must use `getCurrentAgencyId()` + existing RPC or `.eq("agency_id", …)`.
3. Do not add client-side fetches that accept `agency_id` query params.
4. Do not reintroduce visit `notes` or care note text on the dashboard UI.

---

## Files reviewed

- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/dashboard-view.tsx`
- `src/lib/dashboard-data.ts`
- `src/lib/agency.ts`
- `src/lib/care-plan-data.ts`
- `src/lib/cqc-evidence-data.ts`
- `src/lib/compliance-data.ts`
- `src/lib/visit-map-data.ts`
- `src/lib/permissions.ts`
