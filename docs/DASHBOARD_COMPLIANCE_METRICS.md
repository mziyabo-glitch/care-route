# Dashboard compliance metrics

**Date:** 2026-05-27  
**UI:** Care Control Centre — sections A–G  
**Loader:** `src/lib/dashboard-data.ts`

**Disclaimer:** These definitions describe operational signals in Care Route. They support agency oversight and record-keeping; they do **not** constitute CQC registration, legal compliance, or a substitute for policies, training, and professional review.

---

## A. Hero

| Element | Definition | Data source |
|---------|------------|-------------|
| Greeting name | User display name from auth metadata / email | `resolveUserGreetingName` |
| Agency | Current agency name | `fetchAgencyName` |
| UK date | Long-form date in Europe/London | `todayInLondon` + `Intl` |
| Status line | Count of priority actions (max 5) | Derived from `priorityActions.length` |

---

## B. Today's safety status (4–6 cards)

| Metric | Definition | Data source | Implemented |
|--------|------------|-------------|-------------|
| Visits today | Count of visits in today's UTC day window (London calendar date) | `getVisitMapRows` | Yes |
| Completed | `display_status === 'completed'` | Visit row + `resolveDisplayStatus` | Yes |
| Late or missed | Sum of late + missed counts | Same | Yes |
| Missing notes | Completed visit with no care note | `visit_care_notes` + `isMissingCareNote` | Yes |
| Care plans overdue | Active/draft plans with `review_due_date < today` | `loadCarePlanReviewStats` | Yes (manager+) |
| High-risk CQC open | Open `cqc_evidence_items` where `risk = 'high'` | `summariseCqcEvidence` | Yes (manager+) |

Carer/viewer roles see four cards (visits, completed, late/missed, missing notes).

---

## C. Priority actions (top 5)

| Reason | Priority | Definition | Data source |
|--------|----------|------------|-------------|
| Missed visit | 1 | `status = missed` or compliance missed set | `getComplianceIssues` + visit status |
| Late — not checked in | 2 | Derived late, no check-in | `resolveDisplayStatus` |
| Checked in — not out | 3 | `in_progress` with check-in, no check-out | `visit_actuals` |
| Care note missing | 4 | Missing note heuristic | `visit_care_notes`, actuals |
| Double-up gap | 5 | `missing_second_carer` on RPC payload | `list_visits_for_week` |

One row per visit (highest priority reason wins). **No visit note or care note text** — fixed label `"Care visit"`. Client name, time, carer names, and reason only.

---

## D. Happening now / Up next / Later today

| Bucket | Definition | Limit |
|--------|------------|-------|
| Now | In progress, late, or due within 1 hour in a UK call window | 6 |
| Next | Scheduled/due soon, future start, in call window, not in Now | 4 |
| Later today | Remaining scheduled/due soon today in call windows | 6 |

Call windows: Morning, Lunch, Tea, Bedtime (Europe/London). No note text on timeline rows.

---

## E. CQC readiness strip

| Card | Definition | Data source |
|------|------------|-------------|
| Safe / Effective / Caring / Responsive / Well-led | Per-category open, overdue, and high-risk open counts | `cqc_evidence_items` via `summariseCqcEvidence` |

**Not shown on dashboard:** evidence titles, descriptions, or linked client detail beyond counts. Manager+ only.

---

## F. Care plan reviews

| Metric | Definition | Data source |
|--------|------------|-------------|
| Overdue | `review_due_date < today` (draft/active) | `care_plans` |
| Due this week | `today <= review_due_date <= today + 6 days` | Same |
| Up to date | `review_due_date > today + 6 days` | Same |
| Most overdue (top 3) | Earliest overdue plans | `loadOverdueCarePlanReviews` — client name + due date only |

Manager+ only. No plan section bodies.

---

## G. Confidentiality panel

| Element | Definition | Data source |
|---------|------------|-------------|
| Reassurance copy | Static — explains no note/plan text on dashboard | UI |
| Restricted section count | Rows in `care_plan_sections` with `confidentiality_level = 'restricted'` | Head count query |
| Role notice | Whether user can view restricted sections | `canViewRestrictedCarePlan` |

---

## Removed from dashboard (2026-05-27)

Previous sections moved off the landing page — use dedicated routes instead:

- Rota capacity → `/rota`
- Payroll & billing snapshot → `/payroll`, `/billing/summary`
- Visit map preview → `/visit-map`
- Legacy compliance pulse tiles → replaced by CQC readiness strip + safety status

---

## Deferred (documented, not built)

- Medication-specific compliance on dashboard  
- Safeguarding open flags tile  
- Training expiry tile  
- Export / audit log viewer on dashboard  

See `docs/COMPLIANCE_DASHBOARD_NEXT.md` for phased implementation notes.
