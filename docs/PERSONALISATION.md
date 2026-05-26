# Dashboard personalisation

How display names and agency names are stored and who can change them.

## Agency name

| Item | Detail |
|------|--------|
| **Storage** | `public.agencies.name` |
| **Shown on** | Care Control Centre dashboard hero (`/dashboard`) |
| **Who can edit** | **Owner**, **admin**, or **manager** for the **current** agency only |
| **How** | Settings → General → Agency → Save agency name |
| **API** | `PATCH /api/settings/agency` — uses `getCurrentAgencyId()`; never trusts client `agency_id` |
| **Database** | `update_agency_name` / `get_agency_name_for_member` RPCs (migrations `20260526180000`, `20260526190000`) — SECURITY DEFINER, inline `agency_members` check |

Viewers cannot rename the agency.

## User display name

| Item | Detail |
|------|--------|
| **Storage** | Supabase Auth **`user_metadata`** (`display_name`, `full_name`, `first_name`, `last_name`) |
| **Shown on** | Dashboard greeting, e.g. `Good evening, Brian` |
| **Who can edit** | The logged-in user only |
| **How** | Settings → General → Personal profile → Save display name |
| **API** | `PATCH /api/settings/profile` — server `supabase.auth.updateUser()` with session JWT |

We do **not** write to `auth.users` from the browser. There is no separate `profiles` table in the core migrations.

### Greeting fallback order

1. `user_metadata.display_name` (first word used in greeting)
2. `first_name` / `last_name` or `full_name`
3. Email local-part (e.g. `brian` from `brian@example.com`) — only if no display name set

## Current agency resolution

Unchanged: **`getCurrentAgencyId()`** / **`getCurrentAgency()`** use the newest `agency_members.created_at` row. No agency switcher. Personalisation does not change which agency is active.

## Privacy and security

- Display name is optional; keep it professional (no clinical detail).
- Do not log display names or care content in production application logs.
- Agency updates are agency-scoped and role-checked server-side.
- Email is read-only in Settings (change via Supabase Auth / account flows later if needed).

## Apply migration (production)

After deploy, run migrations **`20260526180000_update_agency_name_rpc.sql`** and **`20260526190000_fix_update_agency_name_rls.sql`** on Supabase. Then `NOTIFY pgrst, 'reload schema';`.

## Testing

1. **Settings → General** — set display name to `Brian Smith`; open **Dashboard** — hero should show `Good …, Brian` and real agency name.
2. As **owner/admin/manager** — change agency name; dashboard hero updates after save (and `router.refresh()`).
3. As **viewer** — agency name field read-only; profile save still works.
