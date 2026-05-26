# Dashboard compliance metrics

**Date:** 2026-05-26  
**UI:** Care Control Centre — Compliance pulse + Today's safety status  
**Loader:** `src/lib/dashboard-data.ts`

**Disclaimer:** These definitions describe operational signals in Care Route. They support agency oversight and record-keeping; they do **not** constitute CQC registration, legal compliance, or a substitute for policies, training, and professional review.

---

## Today's safety status

| Metric | Definition | Data source | Status / fields | Edge cases | Implemented |
|--------|------------|-------------|-----------------|------------|-------------|
| Visits today | Count of visits with `start_time` in today's UTC day window (Europe/London calendar date) | `list_visits_for_week` via `getVisitMapRows` | All statuses | Window matches visit map (`dayRangeUtc`) | Yes |
| Completed | `display_status === 'completed'` | Visit row + `resolveDisplayStatus` | `visits.status`, actuals check-in | Admin-adjusted times not surfaced separately | Yes |
| Upcoming / in progress | `scheduled`, `due_soon`, `in_progress`, or `late` | Same | Derived | Includes late not yet marked missed | Yes |
| Late | Scheduled, start passed, no check-in | `resolveDisplayStatus` | `visit_actuals.check_in_at` null | Not the same as `status = missed` | Yes |
| Missed | `visits.status = 'missed'` or display missed | `visits.status` | DB enum | No-show cohort in demo seed | Yes |
| Completed without notes | Completed visit with no `visit_care_notes` row (or checked out without note) | `visit_care_notes` + `isMissingCareNote` logic | `completed` or `check_out_at` set | Same rules as compliance page | Yes |

---

## Needs action (prioritised list)

| Reason | Priority | Definition | Data source |
|--------|----------|------------|-------------|
| Missed visit | 1 | `status = missed` or compliance missed set | `getComplianceIssues` (today) + visit status |
| Late — not checked in | 2 | Derived late, no check-in | `resolveDisplayStatus` |
| Checked in — not out | 3 | `in_progress` with check-in, no check-out | `visit_actuals` |
| Completed without care note | 4 | Missing note heuristic | `visit_care_notes`, actuals |
| Double-up — second carer missing | 5 | `missing_second_carer` on RPC payload | `list_visits_for_week` |

One row per visit (highest priority reason wins).

**Care plan review overdue:** Not implemented — no `review_due_at` on `care_plans` (see `docs/COMPLIANCE_DASHBOARD_NEXT.md`).

---

## Compliance pulse tiles

| Tile | Definition | Data source | Implemented | Compliance relevance |
|------|------------|-------------|-------------|----------------------|
| Missed visits (today) | Count missed today | Safety stats | Yes | Supports monitoring service delivery; not a CQC KPI by itself |
| Without care notes (today) | Completed/checked-out without note | Safety stats | Yes | Documentation gap signal for governance |
| Late / not checked in (today) | Derived late count | Safety stats | Yes | Early warning before missed marking |
| Double-up staffing gaps (today) | Visits where client requires double-up but &lt; 2 assignments | `missing_second_carer` on week RPC | Yes | Staffing adequacy signal |
| Care plan reviews overdue | Active plan past review date | — | **No** — shows "Not tracked yet" | Would need schema + policy |
| Training / competency expiry | Carer training dates | — | **No** | Future |
| Safeguarding flags open | Client/visit safeguarding state | — | **No** | Future |

---

## Payroll & billing snapshot (today)

| Metric | Definition | Data source | Implemented |
|--------|------------|-------------|-------------|
| Completed hours | Sum of minutes for `status = completed` using actual check-in/out minus break, else planned duration | `visit_actuals` + visit times (same rules as `generate_timesheet`) | Yes |
| Worked hours (payroll snapshot) | Sum for `completed` plus `in_progress` with check-in today (actual or planned duration rules) — **excludes** future `scheduled` slots | Same | Yes (admin/owner tile only) |
| Billable (today) | Sum of `billable_minutes` from billing view | `list_billing_for_range` RPC | Yes (manager+) |
| Missed visits (today) | Missed count | Visit status | Yes |

**Not shown:** Approved timesheet totals, mileage breakdown, funder-level summary (use Payroll / Billing pages).

---

## Visit map preview

| Element | Definition | Data source |
|---------|------------|-------------|
| Geocoded count | Visits with `client_lat` / `client_lng` | `list_visits_for_week` |
| Late / missed counts | Same as safety status | `getVisitMapRows` |
| Pin colour | `VisitMapDisplayStatus` | `src/lib/visit-map.ts` |

Static preview list only — full map at `/visit-map`.

---

## Deferred (documented, not built)

- Care plan review overdue  
- Medication-specific compliance  
- Safeguarding open flags  
- Training expiry  
- Admin check-in/out source visibility on dashboard  
- Export / audit log viewer on dashboard  

See `docs/COMPLIANCE_DASHBOARD_NEXT.md` for phased implementation notes.
