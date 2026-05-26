# Compliance dashboard — next build steps

**Date:** 2026-05-26  
**Current implementation:** `src/lib/compliance-data.ts`, `GET /api/compliance`, `(dashboard)/compliance`, `docs/COMPLIANCE.md`.

---

## What exists today

| Signal | Logic |
|--------|--------|
| **Missed visits** | `visits.status = 'missed'` in date range (via `list_visits_for_week`). |
| **Missing care notes** | `status = completed` OR `visit_actuals.check_out_at` set, and no `visit_care_notes` row. |

**Access:** owner, admin, manager (`canAccessCompliance`).  
**Range:** default last 7 days (Europe/London), max 90 days.  
**Out of scope today:** late visits, care plan review, medication-specific checks, safeguarding, admin check-in edit surfacing, training expiry.

---

## Proposed signals (priority order)

### Phase 1 — Same data model (no migration)

1. **Late / overdue scheduled visits**  
   - Visits where `status = 'scheduled'` and `end_time < now()` (range-bound).  
   - Optional: `in_progress` with `end_time` passed and no check-out.  
   - **Why:** Catches failures before someone marks `missed`.  
   - **Implementation:** Extend `getComplianceIssues()` + API response keys `late_visits`; table on compliance page.

2. **Completed without notes (refine)**  
   - Exclude visits marked `missed`.  
   - Optional: only flag if check-out older than N hours (reduce noise).  
   - **Implementation:** Filter tweak in `isMissingCareNote`.

3. **Admin check-in/out visibility**  
   - Visits where `visit_actuals.check_in_source` or `check_out_source` = `admin`.  
   - **Why:** Reg 12 / governance — evidence of manual intervention.  
   - **Implementation:** Join `visit_actuals` in compliance-data; link to visit detail / adjustments API.

4. **Double-up not staffed**  
   - Reuse `missing_second_carer` from `list_visits_for_week` payload if exposed in week visit type.  
   - **Implementation:** Filter visits in range with flag true.

### Phase 2 — Light schema or config (design doc before migration)

5. **Care plan review overdue**  
   - Add `review_due_at` (and optionally `reviewed_at`) on `care_plans`.  
   - Dashboard: active plans where `review_due_at < today`.  
   - **Depends on:** provider policy for review intervals.

6. **Medication notes gap**  
   - Short term: visits with `visit_care_notes` none where `note_type = 'medication'` and client care plan medication section non-empty.  
   - Long term: structured MAR — out of scope unless commissioned.

7. **Safeguarding flags**  
   - `clients.safeguarding_concern boolean` or note_type filter `safeguarding` on open visits.  
   - Dashboard section + manager acknowledgement (future).

### Phase 3 — Later

8. **Training / competency expiry** on `carers` — new columns + compliance tile.  
9. **Audit log viewer** for visit — read `audit_logs` + `visit_adjustments` (admin+).  
10. **Export compliance summary CSV** — log to audit trail.

---

## Implementation sequence (recommended)

| Step | Work | Migration? |
|------|------|------------|
| 1 | Late/overdue visits in `compliance-data.ts` + UI section | No |
| 2 | Admin source filter on compliance page | No |
| 3 | Double-up missing carer tile | No |
| 4 | RLS: carer-scoped care notes (prerequisite for carer-facing compliance) | Yes (RLS policy) |
| 5 | Care plan `review_due_at` + overdue tile | Yes (document first) |
| 6 | Medication note heuristic | No / maybe `note_type` enum doc |
| 7 | Safeguarding flag | Yes |
| 8 | Training expiry | Yes |

Keep each PR small: one signal or one policy change per merge where possible.

---

## API shape (backward compatible)

```json
{
  "start": "2026-05-20",
  "end": "2026-05-26",
  "missed_visits": [],
  "missing_notes": [],
  "late_visits": [],
  "admin_check_in_visits": [],
  "double_up_gaps": []
}
```

Add keys incrementally; UI shows sections only when count &gt; 0 or always with zero state.

---

## Testing

- Extend demo seed expectations (`scripts/seed-swindon-demo-agency.ts`) or smoke checklist: known missed + missing-note counts.  
- Unit-test `getComplianceIssues` date boundaries (London midnight edge).  
- Role test: viewer/carer receive 403 on `/api/compliance`.

---

## Non-goals (this dashboard)

- Replacing CQC notification systems  
- Clinical decision support or automatic safeguarding alerts to authorities  
- Full eMAR replacement  

---

## Related

- `docs/COMPLIANCE.md`  
- `docs/COMPLIANCE_GAP_AUDIT.md`  
