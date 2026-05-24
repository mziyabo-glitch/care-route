# Care Planning MVP — implementation plan

Aligned with existing patterns: **Supabase migrations**, **agency-scoped data**, **RLS** via `agency_members`, **Next.js** `(dashboard)` routes and `api/*` RPC style (to be added in later slices).

Checklists: [`docs/checklists/README.md`](docs/checklists/README.md) · Schema map: [`MVP_SCHEMA_CHECKLIST.md`](MVP_SCHEMA_CHECKLIST.md)

---

## Phase status (production stabilisation)

| Phase | Scope | Code (repo) | Production |
|-------|--------|:-----------:|:----------:|
| 1 | `care_plans`, `care_plan_sections`, RLS | ✅ | [ ] |
| 2 | API + dashboard read/write | ✅ | [ ] |
| 3 | UI `/clients/[id]/care-plan` | ✅ | [ ] |
| 4 | `visit_care_notes` + visit UI | ✅ | [ ] |
| — | **Visit map** (manager+ daily map, `20260228100000`–`00100`) | ✅ | [ ] |
| 5 | Compliance dashboard | ✅ | [ ] |

- [x] Phases 1–5 + visit map implemented in repo
- [ ] Phases 1–5 + visit map verified on production (migrations + [`docs/PRODUCTION_SMOKE_TEST.md`](docs/PRODUCTION_SMOKE_TEST.md))

**Stabilisation tracker:** [`TODO.md`](TODO.md) section A · Audit: [`docs/checklists/production-stabilisation-audit.md`](docs/checklists/production-stabilisation-audit.md)

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

`(dashboard)/compliance` — missed visits + missing care notes (manager+).

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
| **4** | `visit_care_notes` + visit UI — **implemented** (migration `20260227100000_visit_care_notes.sql`, `/api/visits/[id]/care-notes`, `/api/visit-care-notes/[id]`, Visits modal) |
| **5** | Compliance dashboard — **implemented** (`/compliance`, `GET /api/compliance`, `src/lib/compliance-data.ts`) |

---

## Files

- Migration: `supabase/migrations/20260227000000_care_plans.sql`
- Implemented: `src/lib/care-plan-data.ts`, `src/app/api/clients/[id]/care-plan/route.ts`, `src/app/api/clients/[id]/care-plan/sections/route.ts`, `src/app/api/care-plan-sections/[id]/route.ts`, `src/app/(dashboard)/clients/[id]/care-plan/page.tsx`, `care-plan-page-client.tsx`, Clients list link to care plan.

---

## Visit map (MVP)

Manager+ **static daily map** at client geocoded addresses — not live carer tracking.

| Piece | Location |
|-------|----------|
| Page | `(dashboard)/visit-map` |
| API | `GET /api/visit-map?date=&carer_id=` |
| Data | `src/lib/visit-map-data.ts` |
| Docs | `docs/VISIT_MAP.md` |

**Features:** date + carer filter, status pins (scheduled / due soon / late / in progress / completed / missed), check-in/out from `visit_actuals`, missing care note warning, check-in distance warning (when GPS columns populated), fallback table if map unavailable or no coordinates.

**Migrations (apply on production):** `20260228100000_client_geocoded_at.sql`, `20260228100100_visit_actuals_gps.sql` (after care plans / visit notes).

**Stabilisation:** code ✅ in repo; production ⏳ requires migrations + smoke test (visit map section in [`docs/PRODUCTION_SMOKE_TEST.md`](docs/PRODUCTION_SMOKE_TEST.md)).

**Deferred:** live GPS carer tracking — see `docs/VISIT_MAP.md`. Compliance: [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md).

---

## Section C — Care planning polish (repo)

| Item | Status |
|------|--------|
| Link to client care plan from visit care notes modal (+ visit row) | ✅ |
| Default section templates on plan creation (API POST) | ✅ |
| Archive plan UI with confirm; create-new after archive | ✅ |
| Visit notes modal: type filter + author display (agency member email) | ✅ |

**Default sections** (created on `POST /api/clients/[id]/care-plan`): Needs, Risks, Medication, Preferences, Emergency / escalation notes (`section_key`: needs, risks, medication, preferences, emergency; `sort_order` 0–4).

**Author on visit notes:** `GET /api/visits/[id]/care-notes` enriches notes with `author_label` / `author_email` via `list_agency_members` RPC (no `profiles` table).
