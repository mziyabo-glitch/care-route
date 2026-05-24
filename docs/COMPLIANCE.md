# Compliance dashboard

Manager+ view of agency compliance issues over a date range.

## Scope

- **Missed visits** — `visits.status = 'missed'` in the selected range.
- **Missing care notes** — visits with `status = 'completed'` or a check-out in `visit_actuals`, with no row in `visit_care_notes`.

Not included: distance warnings, live GPS, payroll, or billing.

## Routes

| Piece | Location |
|-------|----------|
| Page | `(dashboard)/compliance` |
| API | `GET /api/compliance?start=&end=` |
| Data | `src/lib/compliance-data.ts` |

Default range: last 7 calendar days (Europe/London end date). Maximum range: 90 days.

## Access

Same roles as visit map and billing: **owner**, **admin**, **manager**. Enforced in layout, nav, and API via `canAccessCompliance`.

## Data

Uses existing RPC `list_visits_for_week` plus `visit_actuals` and `visit_care_notes` (no new migration).
