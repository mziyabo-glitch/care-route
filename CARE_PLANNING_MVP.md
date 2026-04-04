# Care Planning MVP — implementation plan

Aligned with existing patterns: **Supabase migrations**, **agency-scoped data**, **RLS** via `agency_members`, **Next.js** `(dashboard)` routes and `api/*` RPC style (to be added in later slices).

---

## Proposed schema

### `care_plans`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | `gen_random_uuid()` |
| `agency_id` | uuid FK → `agencies(id)` | tenant |
| `client_id` | uuid FK → `clients(id)` | one plan lifecycle per client (versioning via rows or `version`) |
| `status` | text | `draft` \| `active` \| `archived` |
| `version` | int | default `1` |
| `effective_from` | date | nullable |
| `effective_to` | date | nullable |
| `created_at` / `updated_at` | timestamptz | |
| `created_by` | uuid FK → `auth.users(id)` | nullable, `ON DELETE SET NULL` |

**Constraint:** partial unique index on `(client_id) WHERE status = 'active'` — at most one active plan per client.

### `care_plan_sections`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `agency_id` | uuid FK → `agencies(id)` | denormalized for RLS (same pattern as `timesheet_lines`) |
| `care_plan_id` | uuid FK → `care_plans(id)` `ON DELETE CASCADE` | |
| `sort_order` | int | default `0` |
| `title` | text | |
| `body` | text | |
| `section_key` | text | nullable stable key for templates/reporting |
| `created_at` / `updated_at` | timestamptz | |

**RLS:** policies mirror `clients` — user may access rows where `agency_id` is in their `agency_members` membership.

**Future (not in first migration):** `visit_care_notes`, compliance queries, `audit_logs` triggers or RPC-side logging.

---

## Route structure (Next.js App Router)

| Path | Purpose |
|------|---------|
| `(dashboard)/clients/[id]/care-plan` | View/edit active care plan and sections for one client |

Optional later: `(dashboard)/compliance` for missed visits + missing notes.

---

## API endpoints (later slices)

Follow existing JSON routes under `src/app/api/`:

| Method | Path | Role | Behaviour |
|--------|------|------|-----------|
| `GET` | `/api/clients/[id]/care-plan` | agency member | Load plan + sections for client |
| `PUT` | `/api/clients/[id]/care-plan` | member | Upsert plan metadata |
| `POST` | `/api/clients/[id]/care-plan/sections` | member | Add/reorder sections |
| `PATCH` | `/api/care-plan-sections/[sectionId]` | member | Update section body/title |

**Alternative:** Supabase RPCs `get_care_plan`, `upsert_care_plan` (security definer) — matches `insert_client`, `list_clients` style.

---

## UI screens

1. **Client care plan page** — list sections (sortable), edit title/body, status (draft/active), effective dates.
2. **Link from Clients list or client row** — “Care plan” → `/clients/[id]/care-plan`.

---

## Implementation order

| Phase | Scope |
|-------|--------|
| **1** | Migration: `care_plans`, `care_plan_sections`, RLS, indexes (this repo) |
| **2** | RPCs or server API + read/write from dashboard |
| **3** | UI: `/clients/[id]/care-plan` |
| **4** | `visit_care_notes` + visit UI |
| **5** | Compliance dashboard |

---

## Files (schema only so far)

- Migration: `supabase/migrations/20260227000000_care_plans.sql`
