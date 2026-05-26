# Data protection audit (UK GDPR)

**Date:** 2026-05-26  
**Scope:** Care Route web app + Supabase backend for UK domiciliary care agencies.  
**Disclaimer:** Engineering assessment only. A full DPIA, privacy notice, DPA with Supabase/sub-processors, and ICO guidance alignment require legal/professional review.

---

## Data categories processed

| Category | Examples in Care Route | GDPR relevance |
|----------|----------------------|----------------|
| Identity & contact | Client/carer names, addresses, postcodes, emails | Personal data |
| Health & care | Care plan sections, visit notes, medication text, risks | **Special category** (Art 9) — likely health data |
| Location | Client geocode, optional check-in/out GPS on `visit_actuals` | Personal data; sensitive in care context |
| Employment | Payroll numbers, timesheets, hours | Personal data (carers) |
| Online identifiers | Supabase `auth.users`, session cookies | Personal data |

**Lawful basis & Art 9 condition:** Not determined in software — provider must document (typically contract/legal obligation for care delivery + explicit policy for health records).

---

## Risk register

| Risk | Severity | Current protections | Recommended mitigations |
|------|----------|---------------------|-------------------------|
| **Client-supplied `agency_id`** on raw table writes | High if APIs accepted body tenancy | Server actions/APIs use `getCurrentAgencyId()`; RPCs verify membership for `p_agency_id` | Never add client `agency_id` to mutation bodies; lint/review new routes |
| **Service role key** exposure | Critical | Used only in `createServiceRoleClient()` for cron; not in browser | Store in Vercel secrets only; rotate; monitor usage; narrow cron query by agency if multi-tenant scale |
| **Cron endpoint** `/api/cron/risk-recalc` | Medium | `CRON_SECRET` header check | Strong random secret; disable route in preview if unused; log invocations without PII |
| **RLS bypass via SECURITY DEFINER RPCs** | Medium (by design) | RPCs check `auth.uid()` + `agency_members` + often role | Code review each new RPC; least privilege roles inside functions |
| **Care notes visible to all agency members** | High for carer/viewer | RLS: any member of `agency_id` | Carer/viewer scoped SELECT; manager+ delete; see COMPLIANCE_GAP_AUDIT |
| **Care plans visible/editable by all members** | High | Same membership-only RLS | Carer read scoped to assigned clients; write manager+ |
| **Carer role scoping** | Medium (partial) | Visits/clients filtered in RLS + `list_visits_for_week` / `list_clients` for `carer` | Extend to `visit_care_notes`, `care_plans`; API double-check |
| **Manager/admin scoping** | Low–medium | Managers see all agency data (intended for coordinators) | Role assignment policy; separate “coordinator” vs “HR admin” later if needed |
| **Viewer role** | Medium | Read-only not enforced on care_plans/notes tables | Read-only RLS or API deny for viewer writes |
| **Payroll CSV export** | Medium | Admin+ only; approved timesheets | Audit log export; warn in UI about local storage; encrypt at rest off-platform (provider process) |
| **Billing JSON** | Low–medium | Manager+; no client clinical content | Same export logging when CSV added |
| **Multi-agency membership** | Medium | Newest membership wins (`getCurrentAgencyId`) | Agency switcher or preference table; UI warning |
| **Logs & debug** | Low | `console.debug` on visit-map with counts/errors, not bodies | Keep NODE_ENV=production free of PII logging; redact in error monitoring |
| **Invite flow** | Medium | Email-bound token; role on accept | Expiry enforced; audit invite create (future) |
| **GPS retention** | Medium | Optional columns on check-in/out | Retention period in privacy notice; optional purge job post-billing period |
| **Soft delete clients** | Low | `deleted_at` / archive RPC | Document retention before hard delete; cascade policy for notes |
| **Supabase as processor** | N/A (governance) | EU/UK hosting choice via project region | DPA with Supabase; sub-processor list; SCCs if US services used |
| **No in-app privacy notice** | Governance gap | None | Link to provider privacy notice; cookie banner if analytics added |

---

## `agency_id` in request bodies

| Pattern | Assessment |
|---------|------------|
| `insert_client({ p_agency_id: agencyId })` | **OK** — `agencyId` from server `getCurrentAgencyId()`, RPC validates membership. |
| Care note `insert({ agency_id: agencyId })` | **OK** — server-set, plus visit verification. |
| Care plan `insert({ agency_id: agencyId })` | **OK** — server-set, client verified. |
| Anti-pattern | Accepting `body.agency_id` from browser without membership check — **not found** in reviewed API routes; guard in code review checklist. |

---

## Row Level Security summary

- Core tables (`clients`, `visits`, `visit_actuals`, …): enabled.  
- `visit_care_notes`, `care_plans`: enabled but **over-permissive** for carer need-to-know.  
- `audit_logs`: admin+ read only — appropriate.  
- Direct PostgREST access: authenticated users use anon key + JWT; RLS is the backstop when APIs use `createClient()`.

---

## Exports and off-system processing

| Export | Data | Risk |
|--------|------|------|
| Payroll CSV | Carer names, payroll numbers, hours | Personal data; may leave UK if downloaded to unmanaged devices |
| Billing (future CSV) | Client billing identifiers, hours | Contractual/financial personal data |
| Compliance UI | Client names in browser | Special category context when linked to missed care |

**Mitigations:** Role-gate exports; audit export events; user messaging on secure handling; consider download expiry (future).

---

## Retention and deletion (product gaps)

| Area | Current | Recommendation |
|------|---------|----------------|
| Visit care notes | Persist until DELETE | Policy-driven retention; soft-delete + audit before purge |
| Care plans | `archived` status | Do not hard-delete without legal hold review |
| Audit logs | Append-only | Retain per provider policy (e.g. 3–7 years); separate archive store later |
| Auth users | Supabase Auth | Process erasure requests at agency + auth level |
| Demo seed | Script with service role | Never run against production; separate project |

**Right to erasure:** Requires operational runbook (identify client across tables, anonymise vs delete, legal exceptions). Not automated in app.

---

## Privacy notice and DPA (later)

Provider-facing checklist (outside code):

- Privacy notice covering carers, clients, representatives  
- Lawful basis and Art 9 condition for care records  
- Supabase DPA and international transfer documentation  
- Breach notification process  
- Training for staff on exports and shared logins  

---

## Security issues requiring urgent attention?

| Issue | Urgent? |
|-------|---------|
| Missing carer scoping on care notes/plans | **Yes** — access control gap for special category data (fix before wide carer rollout). |
| Service role / cron secret misconfiguration | **Yes** if secrets weak or committed to repo — operational, not code defect if secrets are sound. |
| No agency switcher for multi-membership | **Medium** — data integrity, not external attacker. |
| Broad RLS on notes for viewers | **Medium** — depends on whether viewers are trusted office staff. |

**Summary:** No evidence of public unauthenticated clinical API; urgent items are **need-to-know RLS** and **secret hygiene**, not a single critical CVE in application code from this review.

---

## Related docs

- `docs/COMPLIANCE_GAP_AUDIT.md`  
- `docs/AUDIT_TRAIL_DESIGN.md`  
- `docs/AGENCY_SWITCHER.md`  
