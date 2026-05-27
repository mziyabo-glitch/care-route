# Vercel environment variables and Supabase auth URLs

Production app: **https://care-route-two.vercel.app**

Do **not** use Vercel preview URLs in Supabase auth redirect allow-lists for production users (see root `README.md`).

---

## Vercel environment variables

Set in **Vercel → Project → Settings → Environment Variables** for Production (and Preview/Development as needed).

| Variable | Required | Used by | Notes |
|----------|----------|---------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Client, server, middleware | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client, server, middleware | Anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (cron) | `createServiceRoleClient()` | **Server only.** Cron risk recalc; never expose to browser |
| `CRON_SECRET` | Yes (cron) | `api/cron/risk-recalc` | Bearer/header secret for Vercel Cron |
| `VERCEL_GIT_COMMIT_SHA` | Auto | `api/health` | Set by Vercel; optional for deploy trace |

### Verification checklist

- [ ] Production has all required vars; build succeeds (`npm run build`) — confirm in Vercel dashboard (CLI: `vercel env ls` if logged in)
- [x] `GET https://care-route-two.vercel.app/api/health` returns 200 — **2026-05-27**
- [x] Login page loads without Supabase env errors — **2026-05-27** (public `/login` 200)
- [x] Cron route rejects requests without `CRON_SECRET` — **2026-05-27** (`GET /api/cron/risk-recalc` → 401)

---

## Supabase auth redirect URLs

Configure under **Supabase → Authentication → URL configuration**.

### Site URL (production)

- [ ] `https://care-route-two.vercel.app`

### Redirect URLs (allow list)

Include production and local dev paths used in `src/app/login/page.tsx`:

| Path | Purpose |
|------|---------|
| `https://care-route-two.vercel.app/auth/callback` | Magic link / email confirm (`emailRedirectTo`) |
| `https://care-route-two.vercel.app/update-password` | Password reset |
| `http://localhost:3000/auth/callback` | Local magic link |
| `http://localhost:3000/update-password` | Local password reset |

Optional: `http://127.0.0.1:3000/...` if developers use that host.

### Verification checklist

- [ ] Magic link from production login completes and lands on `/dashboard`
- [ ] Forgot-password email opens `/update-password` on production domain
- [ ] No redirect mismatch errors in Supabase Auth logs
