# Run Supabase Migrations Manually

If you see **"Could not find the function `public.list_timesheets`"** or similar schema errors, your Supabase database needs the migrations applied.

## Step 1: Open Supabase SQL Editor

1. Go to [supabase.com](https://supabase.com) and sign in
2. Select your **care-route** project
3. Click **SQL Editor** in the left sidebar

## Step 2: Run the Payroll Migration

1. **Option A (Windows):** Run `npm run migrate:copy | clip` to copy the migration to clipboard, then paste (Ctrl+V) into the SQL Editor
2. **Option B:** Open `supabase/migrations/20260224000000_visit_actuals_payroll.sql` in your editor, copy all (Ctrl+A, Ctrl+C)
3. Paste into the Supabase SQL Editor
4. Click **Run** (or press Ctrl+Enter)

If you see **"Table public.visits does not exist"**, run `bootstrap_prerequisites.sql` first (see Step 0 below).

## Step 0: Fresh Database (Only if needed)

If you get `Table public.visits does not exist`, your database is missing earlier schema. Run this first:

1. Open `supabase/scripts/bootstrap_prerequisites.sql`
2. Copy the entire file and run it in the SQL Editor
3. Then run the payroll migration (Step 2)

## Verify

After running the migration, reload the Payroll page. The error should be gone.
