# Woodlands — Resolved Issues & Permanent Standards

These are real bugs that were hit in production or development. Each fix is permanent. Do not reintroduce these patterns.

---

## 1. Supabase client rules

**Rule:** All admin DB operations must use `supabaseAdmin` (service role client). The regular `supabase` anon client is for auth operations only. Never use the anon client for DB reads/writes in admin pages.

**supabaseAdmin config** (`src/lib/supabaseAdmin.js`):
```js
createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    storageKey: 'sb-admin-token',
  },
})
```

**Why:** The anon client is subject to RLS and returns empty results or permission errors for rows the logged-in user doesn't own. Admin pages need unrestricted access.

---

## 2. Edge function secrets — service role key naming

**Rule:** Store the service role key as `SERVICE_ROLE_KEY` in Edge Function Secrets. Do not use `SUPABASE_SERVICE_ROLE_KEY`.

**Why:** The Supabase runtime auto-injects `SUPABASE_SERVICE_ROLE_KEY` but it is the new 41-character non-JWT key format. This key cannot be used for `auth.admin` calls (e.g. `createUser`), which require the JWT service role key. The manually set `SERVICE_ROLE_KEY` holds the correct JWT value.

---

## 3. Auth trigger — handle_new_user must not exist

**Rule:** There must be no `handle_new_user` trigger on `auth.users`. If found, drop it.

```sql
drop trigger if exists handle_new_user on auth.users;
drop function if exists public.handle_new_user();
```

Verify the trigger is absent before any user creation work:
```sql
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

**Why:** The trigger caused an `unexpected_failure` error on every user creation call made through `auth.admin.createUser`. User profile rows are created manually by the `create-user` edge function after the auth user is created, not via trigger.

---

## 4. RLS policies — both policies required on every table

**Rule:** Every table must have both:
1. `authenticated` SELECT policy
2. `service_role` ALL policy

Template:
```sql
alter table <table> enable row level security;
create policy "authenticated read <table>" on <table>
  for select to authenticated using (true);
create policy "service role full access on <table>" on <table>
  for all to service_role using (true) with check (true);
```

**Why:** Missing the service role policy causes the admin client to return silent empty results even though no error is thrown. This is hard to debug. Always include both.

---

## 5. Vercel SPA routing

**Rule:** `vercel.json` must always contain the catch-all rewrite below. Without it, direct URL visits and hard refreshes return 404 for every route except `/`.

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**Why:** Vercel serves static files by path. Without the rewrite, any URL that isn't the root (e.g. `/admin`, `/inventory`) returns a 404 on hard refresh or direct navigation because there is no corresponding file on disk.

---

## 6. Shared constants

**Rule:** Units, roles, departments, and any repeated dropdown values must be defined in `src/lib/constants.js` and imported wherever used. Never hardcode these inline in components.

```js
// src/lib/constants.js
export const UNITS = ['kg', 'g', 'litres', 'ml', 'units', 'portions', 'boxes', 'bags', 'bottles', 'cans']
```

**Why:** Inline lists drift out of sync across pages. A single source of truth ensures every dropdown shows the same options.

---

## 7. Column naming — user_profiles

**Rule:** The role column on `user_profiles` is `role`, not `user_role`. Before writing any query against an unfamiliar table, verify actual column names:

```sql
select column_name from information_schema.columns where table_name = 'user_profiles';
```

**Why:** A `user_role` column reference caused silent null values in user listings. The schema uses `role` as the column name.

---

## 8. Foreign key on user_profiles — deferrable constraint

**Rule:** The foreign key `user_profiles.id → auth.users(id)` must be `DEFERRABLE INITIALLY DEFERRED`.

```sql
alter table user_profiles
  add constraint user_profiles_id_fkey
  foreign key (id) references auth.users(id)
  deferrable initially deferred;
```

**Why:** The edge function creates the auth user and then immediately inserts the profile row within the same operation. A non-deferred FK constraint fires before the transaction commits and raises a constraint violation. The deferred version checks only at commit time, by which point both rows exist.

---

## 9. Every new table — mandatory SQL block (no exceptions)

**Rule:** Before writing any frontend code for a new module, run this exact block for every table in that module. If any of these 3 lines are missing, the frontend will get permission denied errors. No exceptions.

```sql
-- MANDATORY for every new table — never skip any of these 3 lines
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access table_name" ON table_name FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON table_name TO service_role;
```

**Why:** Missing any one of these causes silent empty results or permission denied errors in the frontend, with no obvious error message to diagnose. The service role policy is what allows `supabaseAdmin` (the service-role client) to read and write the table. Without the grant, even the service role client gets blocked. RLS without the policy means every query returns zero rows.

Always run all three together in the same migration block so none can be forgotten independently.

---

## 10. Scaffold reconciliation — verify schema before writing any frontend code

**Rule:** Before building any module that has an existing scaffolded page, always do all of the following for every related table:

1. Run the column query:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'x'
ORDER BY ordinal_position;
```

2. Compare the output against the spec column names line by line.

3. Run all necessary `ALTER TABLE` statements to add missing columns.

4. Drop `NOT NULL` constraints on old scaffold columns that conflict with the new spec.

5. Never assume scaffold column names match the spec — they won't.

**Common mismatches found across this project:**

| Scaffold name | Correct name |
|---|---|
| `customer_name` | `guest_name` |
| `customer_phone` | `guest_phone` |
| `customer_email` | `guest_email` |
| `organizer` | `organiser` |
| `title` | `name` |
| `description` | `notes` |
| `capacity` | `guest_count` |
| `venue` | `venue_area` |
| `is_active` (boolean) | `status` (text with CHECK) |

**Why:** Building against the wrong column names causes silent empty results, type errors, or constraint violations that are hard to trace back to a spelling mismatch. One query before starting saves the rework.

---

## 11. Reports are built last

**Rule:** The Reports module is always built after all other modules are complete.

**Why:** Reports need full visibility of all data sources. Building reports before the underlying modules are stable means the report layer ends up querying half-formed schemas, missing tables, or provisional column names — all of which require rework. Complete every module first, then build reports once the data model is settled.

---

## 12. Seed data rules

**Rule:** Follow these exactly when writing seed INSERT statements:

- Always cast date strings explicitly: `'2026-05-30'::date` not `'2026-05-30'`
- Never use `ON CONFLICT` unless the constraint is confirmed to exist
- Check constraints exist before using them:
```sql
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'x';
```

**Why:** Implicit date casting silently inserts wrong values in some Postgres versions. `ON CONFLICT` on a non-existent constraint throws a syntax error that blocks the entire migration.

---

## 13. Column naming conventions

**Rule:** Always use these names — no exceptions, no alternatives:

- **British spelling:** `organiser` not `organizer`
- **Customer-facing bookings:** `guest_name`, `guest_phone`, `guest_email`
- **State with more than 2 values:** `status text` with a `CHECK` constraint — never `is_active boolean`
- **Internal staff notes:** `notes` — never `description`
- **Entity name:** `name` — never `title`
- **Phone fields:** always international format stored as `text`

**Why:** Inconsistent naming across modules causes query mismatches, confusing diffs, and subtle bugs when data is shared between views or reports.

---

## 14. Environment variables

**Rule:** All three must exist in both `.env.local` AND Vercel environment variables before any frontend DB calls will work:

```
VITE_SUPABASE_URL=https://[project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_SERVICE_ROLE_KEY=...
```

- `VITE_SUPABASE_URL` must be the full URL including `https://` — not just the project ref
- Edge function secrets use `SERVICE_ROLE_KEY` (no `VITE_` prefix, no `SUPABASE_` prefix) — see section 2

**Why:** Missing a variable causes silent auth failures or empty query results with no clear error. Vercel deployments and local dev both need all three set independently.
