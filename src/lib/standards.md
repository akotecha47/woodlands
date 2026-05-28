# Woodlands — Resolved Issues & Permanent Standards

These are real bugs that were hit in production or development. Each fix is permanent. Do not reintroduce these patterns.

---

## 1. Supabase admin client

**Rule:** All DB reads/writes in admin pages must use `supabaseAdmin` (service role client). Never use the anon `supabase` client for admin operations.

**Config** (`src/lib/supabaseAdmin.js`):
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

**Rule:** `vercel.json` must include a catch-all rewrite or direct URL visits return 404.

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

## 9. Every new table requires these three things

**Rule:** Without exception, every new table needs all three of the following:

```sql
-- 1. Enable RLS
ALTER TABLE x ENABLE ROW LEVEL SECURITY;

-- 2. Service role policy (full access for backend/admin operations)
CREATE POLICY "service role full access x" ON x
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Grant
GRANT ALL ON x TO service_role;
```

**Why:** Missing any one of these causes silent empty results or permission denied errors in the frontend, with no obvious error message to diagnose. The service role policy is what allows `supabaseAdmin` (the service-role client) to read and write the table. Without the grant, even the service role client gets blocked. RLS without the policy means every query returns zero rows.

Always add all three together in the same migration block so none can be forgotten independently.

---

## 10. Scaffolded tables — verify schema before writing frontend code

**Rule:** Before building any module that has an existing scaffolded page, run the following query and share the output:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'x'
ORDER BY ordinal_position;
```

The scaffold may have different column names, spellings, or constraints than the new spec. Reconcile before writing any frontend code.

**Watch for:**
- American vs British spelling (`organizer` vs `organiser`)
- `NOT NULL` constraints on old columns that no longer exist in the new spec
- Duplicate columns from iterative `ALTER TABLE` migrations
- Old column names (`title`, `description`, `capacity`) conflicting with new spec names (`name`, `notes`, `guest_count`)

**Why:** Building against the wrong column names causes silent empty results, type errors, or constraint violations that are hard to trace back to a spelling mismatch. One query before starting saves the rework.

---

## 11. Reports are built last

**Rule:** The Reports module is always built after all other modules are complete.

**Why:** Reports need full visibility of all data sources. Building reports before the underlying modules are stable means the report layer ends up querying half-formed schemas, missing tables, or provisional column names — all of which require rework. Complete every module first, then build reports once the data model is settled.
