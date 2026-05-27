# Care plans MVP (inspection-ready)

Living domiciliary care plans with review governance and confidential sections.

## Schema

`care_plans` (see `20260227000000_care_plans.sql`, `20260527100100_care_plans_review_confidentiality.sql`):

| Field | Purpose |
|-------|---------|
| `status` | `draft`, `active`, `archived` |
| `review_due_date` | Next review due (default +90 days on create) |
| `last_reviewed_at`, `last_reviewed_by` | Set when manager marks reviewed |
| `confidentiality_level` | Plan-level `standard` / `restricted` |

`care_plan_sections.confidentiality_level` — `confidential_notes` template defaults to **restricted**.

## Default sections (new plans)

1. Personal details / preferred name  
2. Important contacts  
3. Medical conditions  
4. Medication support notes  
5. Mobility  
6. Personal care  
7. Nutrition and hydration  
8. Communication needs  
9. Risks and hazards  
10. Preferences and routines  
11. Emergency instructions  
12. Confidential notes (restricted)

Defined in `DEFAULT_CARE_PLAN_SECTION_TEMPLATES` (`src/lib/care-plan-data.ts`).

## API

| Action | Route |
|--------|--------|
| Load / create / update | `/api/clients/[id]/care-plan` |
| Mark reviewed | `PATCH` with `{ plan_id, mark_reviewed: true }` (+90 days review due) |
| Sections CRUD | `/api/clients/[id]/care-plan/sections`, `/api/care-plan-sections/[id]` |

**Writes:** manager+ only (API + RLS).

## UI (`/clients/[id]/care-plan`)

- Plan status, effective dates, review due (overdue highlight)
- Mark reviewed button
- Standard vs confidential section groups with badges
- Confidentiality notice copy
- Carers: read assigned-client plans; no write; restricted sections hidden

## Compliance link

Overdue `review_due_date` on active/draft plans appears on `/compliance`.

See also: [CARE_PLANNING_MVP.md](../CARE_PLANNING_MVP.md).
