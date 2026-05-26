# Compliance gap audit (Care Route)

**Date:** 2026-05-26  
**Scope:** UK domiciliary care context — CQC evidence themes (Reg 17 governance, Reg 12 safe and effective care), UK GDPR special-category data.  
**Method:** Code and schema review of visits, visit_actuals, visit_care_notes, care_plans, compliance dashboard, payroll CSV, billing, clients, carers, agency_members, and `src/app/api/*`.

**Disclaimer:** This document is an engineering gap analysis, not legal advice. CQC registration, DPIAs, privacy notices, DPAs, policies, and professional review remain the provider’s responsibility. Care Route does not “certify” legal or CQC compliance.

---

## Executive summary

Care Route has a solid **multi-tenant foundation** (agency-scoped data, RLS, SECURITY DEFINER RPCs with membership checks, server-resolved `agency_id`). **Visit actuals** (check-in/out, admin adjustments with reason) and a **compliance dashboard** (missed visits, completed visits without care notes) support operational oversight. **Gaps** are concentrated in: immutable/complete **audit trails** for care plans and care notes, **carer-scoped** access to sensitive tables, **late/missed automation**, care plan **review governance**, and **multi-agency** tenancy when users belong to more than one agency.

---

## What already supports compliance-by-design

| Area | Evidence in product |
|------|---------------------|
| **Tenancy** | `agency_id` on core tables; RLS policies keyed to `agency_members`; APIs use `getCurrentAgencyId()` (server) not client-supplied tenancy for mutations. |
| **Roles** | `owner` / `admin` / `manager` / `viewer` / `carer`; manager+ for rota edits, billing, compliance, visit map; admin+ for payroll export; RPC role checks (e.g. `update_client` manager+ only). |
| **Visits lifecycle** | Statuses: `scheduled`, `in_progress`, `completed`, `missed`; manual/API status updates; conflict checks on scheduling. |
| **Visit actuals** | `visit_actuals` with check-in/out timestamps and `carer` vs `admin` source; optional GPS columns for map distance (not live tracking). |
| **Admin time corrections** | `admin_adjust_visit_time` RPC requires **reason**; field-level history in `visit_adjustments`; summary in `audit_logs`. |
| **Check-in/out audit** | `check_in` / `check_out` RPCs write `audit_logs` (including admin-on-behalf path). |
| **Care notes** | `visit_care_notes` per visit with `author_id`, `note_type`, timestamps; API verifies visit belongs to agency. |
| **Care plans** | Structured `care_plans` + `care_plan_sections` (needs, risks, medication, preferences, emergency); one active plan per client; archive status. |
| **Compliance dashboard** | `/compliance` + `GET /api/compliance`: missed visits; completed / checked-out without `visit_care_notes`; manager+ gate; 90-day max range. |
| **Payroll governance** | Timesheets draft → approved → exported; CSV export admin+ only when approved/exported. |
| **Billing** | Agency-scoped billing RPCs; manager+ API access. |
| **Carer data minimisation (partial)** | Carer role: visits/clients limited via RLS + `list_*` RPC filters to assigned visits/clients. |
| **Client soft delete** | `archive_client` RPC rather than hard delete in API. |

---

## Gaps and risks

### Governance & evidence (Reg 17 themes)

| Gap | Risk |
|-----|------|
| No audit trail for **care plan** create/update/archive or **section** edits | Hard to demonstrate who changed medication/risk content and when for inspections or disputes. |
| No audit trail for **visit care notes** create/update/**delete** | Deleted or edited notes leave weak forensic evidence; conflicts with “contemporaneous records” expectations. |
| No audit for **client/carer** changes beyond implicit `updated_at` | Client PII/funding changes not centrally queryable for governance reviews. |
| **Missed visits** rely on manual `status = missed` | Scheduled visits that were never checked in/out may not appear as missed without rota discipline or future automation. |
| No **late visit** / **no show** rules in compliance dashboard | Managers cannot yet see “still scheduled past end time” as a first-class signal. |
| **Care plan review overdue** not tracked | No `review_due_at` or dashboard tile for plan freshness (CQC often asks about up-to-date plans). |
| **audit_logs** read: admin+ only, not exposed in UI | Evidence exists in DB for check-in/out and adjustments but is not surfaced for managers during audits. |
| **Billing** JSON only (no export audit) | Less critical than clinical records but weak export traceability. |

### Safe care (Reg 12 themes)

| Gap | Risk |
|-----|------|
| **visit_care_notes** RLS: any agency member can SELECT/UPDATE/DELETE all notes in agency | Carers or viewers could access notes for visits/clients they are not assigned to (need-to-know breach). |
| **care_plans** RLS: any agency member can read/write/delete | Carers may read full plans for all clients in agency, not only assigned; viewers may edit plans via direct table/API. |
| Care note **PATCH/DELETE** not restricted to author or manager+ | Any member could alter another carer’s record. |
| **Medication** section is free text only | No structured MAR/eMAR, no link from visit note types to medication administration evidence. |
| No **safeguarding** flags or escalations in data model | Relies entirely on note content discipline. |
| **Viewer** role can access dashboard areas that list client names across agency | Appropriate for back-office; confirm role assignment policy with provider. |

### UK GDPR / security

| Gap | Risk |
|-----|------|
| **Multi-agency users**: `getCurrentAgencyId()` = newest `agency_members.created_at` | Wrong agency context without switcher; cross-agency mistake if user has two memberships. |
| **Service role** cron (`/api/cron/risk-recalc`) | Bypasses RLS; must keep `CRON_SECRET` and key rotation tight; cron scans visits globally by date (no agency filter in route). |
| **GPS** on visit_actuals | Location data is sensitive; needs purpose limitation and retention policy in provider documentation. |
| No documented **retention/deletion** for notes, plans, audit | Subject access and erasure processes undefined in product. |
| **Exports** (payroll CSV) | Download not logged; file may be stored insecurely off-system. |

### API surface (`src/app/api`)

**Generally good:** Most routes resolve agency server-side; manager+/admin+ gates on sensitive operations; visit/care-plan mutations verify entity belongs to agency.

**Notable gaps:**

- `visit-care-notes/[id]` PATCH/DELETE: agency scope only, no author/role check.
- Care plan/section routes: no manager+ requirement (relies on broad RLS).
- `middleware.ts` refreshes session but does not enforce auth (dashboard layout does).
- `GET /api/cron/risk-recalc`: protected by secret only — correct pattern if secret is strong and not logged.

---

## High priority fixes (small, reviewable)

1. **Tighten RLS for `visit_care_notes` and `care_plans`** — carer SELECT (and write) scoped to assigned clients/visits; manager+ for plan write/archive; consider viewer read-only.
2. **Restrict care note PATCH/DELETE** — author or manager+ in API (and optionally RLS).
3. **Extend audit logging** (see `docs/AUDIT_TRAIL_DESIGN.md`) — care plan, care notes, client/carer updates; avoid parallel tables if `audit_logs` can be extended.
4. **Compliance: late / still-scheduled visits** — query visits past `end_time` still `scheduled` (and optionally `in_progress` without check-out).
5. **Document multi-agency behaviour** — until switcher exists, warn in onboarding/admin UI when multiple memberships detected.

---

## Medium improvements

- Care plan: `review_due_at`, “overdue review” on compliance dashboard.
- `note_type` conventions (medication, safeguarding) + filter on compliance.
- Manager UI to list `visit_adjustments` / `audit_logs` for a visit (data already exists).
- Log payroll/billing export events to audit table.
- Automated nightly job to flag or set missed visits (with override reason), design before implementing.
- Training/competency expiry (schema + dashboard) — later phase.
- Agency switcher per `docs/AGENCY_SWITCHER.md` when multi-tenant product need is confirmed.

---

## Areas to avoid overclaiming

- Do not market “CQC compliant software” — providers remain accountable for regulated activities and records.
- Compliance dashboard is **operational triage**, not a full QMS or statutory notification system.
- Demo seed (Swindon) is synthetic — not representative of production governance maturity.
- RLS + RPC checks reduce risk but are not a substitute for contracts, training, and access reviews.

---

## Related docs

- `docs/COMPLIANCE.md` — current dashboard scope  
- `docs/AUDIT_TRAIL_DESIGN.md` — evidence trail design  
- `docs/DATA_PROTECTION_AUDIT.md` — UK GDPR-oriented review  
- `docs/COMPLIANCE_DASHBOARD_NEXT.md` — roadmap for dashboard features  
- `docs/AGENCY_SWITCHER.md` — tenancy selection status  
