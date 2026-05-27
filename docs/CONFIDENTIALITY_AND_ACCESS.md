# Confidentiality and access controls

Practical least-privilege for UK domiciliary care agencies.

## Roles (`src/lib/roles.ts`)

| Role | Level | Typical access |
|------|-------|----------------|
| `owner` | 4 | Full agency |
| `admin` | 3 | Full agency; payroll export |
| `manager` | 2 | Care ops, compliance, billing summary, care plan write |
| `viewer` | 1 | Read-only office; standard care plan sections only |
| `carer` | 0 | Assigned visits/clients; standard sections only; no payroll/billing/compliance |

`member` legacy invites map to `viewer`.

## Navigation (UI)

Hidden for carers: **Carers**, **Billing**, **Payroll**, **Visit map**, **Compliance**.

## RLS highlights (`20260527100200_confidentiality_rls.sql`)

| Resource | Rule |
|----------|------|
| `visits`, `clients` | Carers: assigned only (existing + helpers) |
| `care_plans` | Carers: assigned clients; writes manager+ |
| `care_plan_sections` | Restricted: manager+ only; carers see standard on assigned clients |
| `visit_care_notes` | Carers: assigned visits; update/delete own notes or manager+ |
| `cqc_evidence_items` | Read: members; write: manager+ |

## UI cues

- `Confidential` and `Restricted access` badges (`src/app/components/confidentiality-badges.tsx`)
- Care plan confidentiality notice
- Restricted sections grouped separately on care plan page

## Audit trail (MVP)

- Care plan: `created_by`, `last_reviewed_at`, `last_reviewed_by`, `updated_at`
- CQC evidence: `created_by`, `created_at`, `updated_at`
- Visit check-in/out and adjustments: existing `audit_logs` (admin+ read in DB; not surfaced in UI yet)

## Gaps (out of scope)

- Full `audit_logs` UI for care plan/note edits
- GDPR retention/export tooling
- Agency switcher for multi-agency users

See [COMPLIANCE_GAP_AUDIT.md](COMPLIANCE_GAP_AUDIT.md) for the full gap analysis.
