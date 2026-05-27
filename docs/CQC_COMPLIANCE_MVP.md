# CQC compliance MVP

Agency-scoped CQC evidence register on the compliance dashboard, alongside operational visit/note checks.

## Data model

Table `cqc_evidence_items` (migration `20260527100000_cqc_evidence_items.sql`):

| Field | Notes |
|-------|--------|
| `category` | `safe`, `effective`, `caring`, `responsive`, `well_led` |
| `title`, `description` | Evidence summary |
| `client_id`, `visit_id`, `care_plan_id` | Optional links |
| `status` | `open`, `in_review`, `complete` |
| `risk` | `low`, `medium`, `high` |
| `due_date`, `owner` | Governance ownership |
| `created_by`, timestamps | Audit-friendly metadata |

**RLS:** all agency members can read; **manager+** (`owner`, `admin`, `manager`) can insert/update/delete.

## API

| Method | Path | Access |
|--------|------|--------|
| `GET` | `/api/cqc-evidence` | Manager+ |
| `POST` | `/api/cqc-evidence` | Manager+ |
| `PATCH` | `/api/cqc-evidence/[id]` | Manager+ |

`GET /api/compliance` also returns `cqc_summary`, `cqc_items`, and `overdue_care_plan_reviews`.

## UI (`/compliance`)

- Category cards (five key questions)
- Open / overdue / high-risk counts
- Add evidence form
- Open items list with status and risk badges
- Recently completed evidence
- Overdue care plan reviews (linked to client care plan)

## Disclaimer

This supports operational evidence tracking; it does not certify CQC registration or legal compliance.
