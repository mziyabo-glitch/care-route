# Audit trail design

**Date:** 2026-05-26  
**Status:** Design only — **no migration in this document.** Implementation should follow a small, reviewable PR after provider/policy review.

---

## Purpose

Support CQC-style **governance evidence** (who changed what, when, and why) for:

- Care plan CRUD and archive  
- Care plan section CRUD  
- Visit care notes CRUD (especially edits and deletes)  
- Visit actuals admin edits (partially done)  
- Missed visit status changes  
- Payroll CSV export  
- Billing data export (when added)  
- Client and carer record changes  

---

## Current state (as implemented)

| Event | Storage | Notes |
|-------|---------|--------|
| Check-in / check-out | `audit_logs` | `action` = `check_in` / `check_out`; `details` includes `carer_id`, `source` (`carer` \| `admin`). |
| Admin adjust visit times | `visit_adjustments` + `audit_logs` | Per-field before/after + required `reason`; RPC `admin_adjust_visit_time`. |
| Timesheet approve/export | `audit_logs` (in payroll migration RPCs) | Approve/export actions logged. |
| Care plans | **None** | Direct table INSERT/UPDATE/DELETE. |
| Visit care notes | **None** | Including hard DELETE via API. |
| Client update / archive | **None** | `update_client`, `archive_client` RPCs. |
| Carer update | **None** | Table/API updates. |
| Missed status on visit | **None** | `update_visit` / API PATCH. |
| Payroll CSV download | **None** | `GET /api/payroll/[id]/export` streams file only. |
| Billing | **None** | JSON APIs only. |

### Existing `audit_logs` schema (migration `20260224000000_visit_actuals_payroll.sql`)

```text
id, agency_id, user_id, action, entity_type, entity_id, details (jsonb), created_at
```

- RLS: **owner/admin** SELECT for own agency.  
- No `before_json` / `after_json` / `reason` / `ip` / `user_agent` columns.  
- `visit_adjustments` holds structured field history for time edits (keep this; do not duplicate in audit).

---

## Recommendation: extend `audit_logs` first

**Do not add a second `audit_events` table** unless a future requirement needs incompatible shape. Instead, extend `audit_logs` minimally:

| Column (proposed) | Type | Purpose |
|-------------------|------|---------|
| `actor_role` | `text` | Snapshot of `agency_members.role` at action time. |
| `before_json` | `jsonb` | Prior state (or null for create). |
| `after_json` | `jsonb` | New state (or null for delete). |
| `reason` | `text` | Required for admin adjustments, archive, missed status, exports (nullable elsewhere). |
| `ip` | `inet` or `text` | From request headers where API-layer logging. |
| `user_agent` | `text` | Optional; from request. |

Keep existing `details` for small payloads (check-in metadata) to avoid breaking RPCs.

**Alternative name:** If stakeholders prefer greenfield naming, `audit_events` with the fields below is equivalent; migrate writers to one table only.

### Suggested `audit_events` shape (if new table preferred)

| Field | Type |
|-------|------|
| `id` | `uuid` PK |
| `agency_id` | `uuid` FK |
| `actor_user_id` | `uuid` FK → `auth.users` |
| `actor_role` | `text` |
| `entity_type` | `text` (e.g. `care_plan`, `visit_care_note`, `client`, `timesheet`) |
| `entity_id` | `uuid` |
| `action` | `text` (e.g. `create`, `update`, `delete`, `archive`, `export`) |
| `before_json` | `jsonb` |
| `after_json` | `jsonb` |
| `reason` | `text` |
| `created_at` | `timestamptz` |
| `ip` | `text` |
| `user_agent` | `text` |

RLS: same as today — admin+ read; inserts via SECURITY DEFINER helper only (no client INSERT policy).

---

## Event catalogue (minimal)

| entity_type | action | Trigger | reason required? | before/after |
|-------------|--------|---------|------------------|--------------|
| `visit` | `check_in`, `check_out` | Existing RPCs | No | `details` only (keep) |
| `visit` | `adjust_time` | `admin_adjust_visit_time` | Yes (already) | `visit_adjustments` + audit summary |
| `visit` | `status_change` | `update_visit` when status → `missed` (etc.) | Yes if `missed` | status, times |
| `visit_care_note` | `create`, `update`, `delete` | API routes / DB trigger | No / optional on delete | body, note_type (truncate in log if huge) |
| `care_plan` | `create`, `update`, `archive` | Care plan API | On archive | status, version, effective dates |
| `care_plan_section` | `update`, `delete` | Section API | No | title, section_key (not full body if policy says redact) |
| `client` | `update`, `archive` | `update_client`, `archive_client` | On archive | name, funding_type flags — avoid full address in log if possible |
| `carer` | `update` | Carer API | No | active, payroll_number presence (not value) |
| `timesheet` | `export` | Payroll export route | No | period, line count |
| `billing` | `export` | Future CSV | No | date range, row count |

**PII in audit rows:** Prefer IDs + changed field names; for care notes, store hash or length + “body_changed”: true unless provider policy requires full text retention in audit (legal review).

---

## Write path pattern

1. Add `public.write_audit_event(...)` SECURITY DEFINER function (single entry point).  
2. Call from existing RPCs (`check_in`, `admin_adjust_visit_time`, …) and from Next.js API routes after successful mutation (care notes, care plans) where RPCs are not used.  
3. Never trust client-supplied `agency_id` — derive from entity or `getCurrentAgencyId()` server-side.  

---

## Read path (later UI)

- Visit detail: tab “History” merging `visit_adjustments` + audit rows for `entity_id = visit`.  
- Compliance: filter `action = export` for payroll.  
- Admin settings: paginated agency audit (admin+ only).  

---

## Out of scope for v1 audit design

- Immutable WORM storage / external SIEM  
- Digital signatures on notes  
- Real-time alerting on safeguarding keywords  

---

## Implementation order (when coding)

1. Schema extend `audit_logs` (or create `audit_events`) + `write_audit_event` RPC.  
2. Care note create/update/delete.  
3. Care plan status/archive + section updates.  
4. Client/carer RPCs.  
5. Visit status → missed with reason.  
6. Payroll export logging.  

Each step: one migration + thin API/RPC hooks; no speculative features.
