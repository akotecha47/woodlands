> **HISTORICAL HEADER — retained for trace.** The text below is the warning that sat at the top of this file between the 26 July 2026 audit and the Sprint B rewrite:
>
> > **SUPERSEDED — do not follow.** This file's guidance predates STREAMLINE_BUILD_STANDARD.md v1.5 and mandates patterns the Standard now forbids (specifically: `supabaseAdmin` in browser code). Being rewritten in Sprint B. Until then, treat this entire file as archival. Authoritative doctrine: STREAMLINE_BUILD_STANDARD.md in repo root, and CLAUDE.md.
>
> That rewrite is this document. The body below is current and authoritative as of Sprint B, 26 July 2026. The former §1, §4, §9 and §14 — which mandated `supabaseAdmin` in browser code, a service-role-only policy template, and `VITE_SUPABASE_SERVICE_ROLE_KEY` in the client env — are **deleted, not deprecated**. They were the root cause of the 36-file service-key spread recorded in `WOODLANDS_AUDIT_2.md` §4.3.

# Woodlands — Permanent Standards

Operational rules for this codebase. Each one is a real bug hit in production or development, or a rule derived from one.

**Authoritative doctrine is `STREAMLINE_BUILD_STANDARD.md` v1.5 in the repo root.** This file is subordinate to it and must never contradict it. Where this file and the Standard disagree, the Standard wins and this file is the defect.

---

## 1. Browser code uses the anon client. Only the anon client.

**Rule:** Every `.from()`, `.rpc()`, `.select()`, `.insert()`, `.update()` and `.delete()` issued from anything under `src/` uses the anon client from `src/lib/supabase.js`:

```js
import { supabase } from '../lib/supabase'
```

There is no second client. `src/lib/supabaseAdmin.js` was deleted in Sprint B and must not be recreated.

**Forbidden, without exception:**

- `supabaseAdmin`, or any browser `createClient()` call taking a service-role key
- `VITE_SUPABASE_SERVICE_ROLE_KEY`, or any `VITE_*` variable holding a secret
- any `service_role` JWT in a file under `src/`, in `index.html`, or in any file Vite bundles

**Why:** Vite inlines every `VITE_*` variable into the public bundle at build time. The app ships as one unsplit chunk, so a key in the bundle is served to every visitor of every route — including unauthenticated ones at `/login` and `/checkin`. A `service_role` key bypasses RLS entirely: full read, write and delete on every table, plus `auth.admin`. This is not a theoretical exposure; it shipped, and is why the key was rotated in Sprint B.

**Authoritative:** `STREAMLINE_BUILD_STANDARD.md` §2.1 ("The service role key never touches the browser") and §2.4 ("Only the anon key is client-side").

**The old rule this replaces** claimed the anon client "returns empty results for rows the logged-in user doesn't own" and concluded that admin pages need the service role. The diagnosis was backwards. Empty results are the signal that a policy or a grant is missing. Write the policy — see §2.

---

## 2. RLS is the access control layer. Not JSX.

**Rule:** Access control lives in the database. `src/lib/roles.js` and `RouteGuard.jsx` gate *navigation*; they are a usability affordance, not a security boundary. Anything that must not be readable or writable by a given role is enforced by an RLS policy.

**Every table needs all four of these, in the same migration that creates it:**

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;

-- 1. service_role escape hatch (Edge Functions only — never the browser)
CREATE POLICY "service_role_all_<t>" ON <t>
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON <t> TO service_role;

-- 2. the grants the anon client actually needs
GRANT SELECT, INSERT, UPDATE ON <t> TO authenticated;

-- 3. read policy
CREATE POLICY "authenticated_read_<t>" ON <t>
  FOR SELECT TO authenticated USING (true);

-- 4. write policies, scoped to the roles the UI actually gives the action to
CREATE POLICY "<t>_manage_insert" ON <t>
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));
```

**`GRANT` and `CREATE POLICY` are two separate gates and you need both.** A table can have a perfectly correct SELECT policy and still return permission-denied because `authenticated` was never granted `SELECT`. This bit this project twice: Sprint A found `event_checklists`, `shift_settings` and `tables` with working policies and no grants, and Sprint B found the same on eleven more tables. Postgres grants DML to `service_role` by default in Supabase, which is why the bug hides while the browser is using a service-role client and surfaces the moment it stops.

**Role lookups use the helper, never a subquery on `user_profiles`:**

```sql
public.current_app_role()   -- migration 021, SECURITY DEFINER
```

It returns the caller's `user_profiles.role`, or NULL if their profile is deactivated (`is_active = false`). SECURITY DEFINER is what lets a policy *on* `user_profiles` consult `user_profiles` without infinite RLS recursion. Writing `EXISTS (SELECT 1 FROM user_profiles WHERE ...)` inline in a policy on that table will recurse.

**Roles are authoritative in `src/lib/roles.js`:** `owner`, `manager`, `kitchen_manager`, `restaurant_manager`. Four. A policy must not reference a role outside that list.

**Authoritative:** `STREAMLINE_BUILD_STANDARD.md` §2.2 ("RLS is part of 'the table exists', not a later task").

---

## 3. Privileged operations go through Edge Functions

**Rule:** Anything that genuinely needs `service_role` — creating auth users, reading data the caller must not be able to read directly, anything unauthenticated that touches PII — goes in a Supabase Edge Function. The key lives in the function's environment, server-side, and never leaves it.

**Every Edge Function verifies the caller itself. Do not rely on the platform's `verify_jwt`** — the anon key satisfies it, and the anon key is public.

**Reference implementation: `supabase/functions/create-user/index.ts`.** The pattern:

```ts
// 1. Bearer token present
const authHeader = req.headers.get('Authorization') ?? ''
const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
if (!token) return jsonResponse({ error: 'Unauthorized' }, 401)

// 2. Token verifies server-side (rejects the anon key: no `sub` claim)
const { data: caller, error } = await admin.auth.getUser(token)
if (error || !caller?.user) return jsonResponse({ error: 'Unauthorized' }, 401)

// 3. Caller holds the required role and is not deactivated
const { data: profile } = await admin.from('user_profiles')
  .select('role, is_active').eq('id', caller.user.id).maybeSingle()
if (!profile || profile.role !== 'owner' || profile.is_active === false)
  return jsonResponse({ error: 'Forbidden' }, 403)

// 4. Validate the body, allowlist any role value, THEN act
```

**Callers send the session JWT, never the anon key:**

```js
const { data: { session } } = await supabase.auth.getSession()
if (!session?.access_token) throw new Error('Session expired')
// Authorization: `Bearer ${session.access_token}`
```

**CORS is pinned to the deployed origin**, never `*`:

```ts
'Access-Control-Allow-Origin': 'https://woodlands-beta.vercel.app'
```

**Public (unauthenticated) functions** — currently `public-checkin` — have no caller to verify, so they compensate: they return only the minimum fields the screen needs, never `select('*')` on a table holding PII, and they validate every input. A public function is the *reason* holder PII is not exposed by an anon RLS policy; it must not undo that by echoing whole rows back.

---

## 4. Edge Function secret naming — `SERVICE_ROLE_KEY`

**Rule:** Store the secret key as `SERVICE_ROLE_KEY` in Edge Function Secrets, set manually. Do not rely on the runtime-injected `SUPABASE_SERVICE_ROLE_KEY`.

**Current value format:** `sb_secret_*`. This project migrated off legacy JWT-based API keys on 26 July 2026 (Sprint B); the anon/service_role JWT pair is disabled and the project now uses an `sb_publishable_*` / `sb_secret_*` pair.

**VERIFIED 26 July 2026 (evening), through the application, not by probe.** An `sb_secret_*` key in `SERVICE_ROLE_KEY` performs both:
- **service-role PostgREST reads and writes** — `public-checkin` returned a holder payload, then created a visit row and set `checked_out_at` on it (`fm_holders` read, `fm_visits` insert + update).
- **`auth.admin` calls including `createUser`** — Admin → Add User created a real user in the browser, which appeared in the user list.

Both exercised while `SERVICE_ROLE_KEY` held `sb_secret_atywb…` and the legacy JWTs were disabled. So the capability is settled for this key format.

### Two verification rules this section was written the wrong way twice before

**1. A passing test proves the configuration that was live when it ran — not the configuration you believe you set.**

This section previously claimed: *"Verified: an `sb_secret_*` key performs both PostgREST reads and `auth.admin` calls."* It was wrong. Both supporting tests ran while `SERVICE_ROLE_KEY` still contained the **legacy** `service_role` JWT, so what passed was the old key. The new format had never been exercised. The claim then sat in doctrine as fact, and its practical effect was an instruction not to swap the secret back to a JWT — advice derived from evidence that did not exist.

Record which key was live when a test passed, not which key you intended to be live.

**2. Never probe with a secret value read from the Management API.**

`GET /v1/projects/{ref}/api-keys` returns a usable value for `publishable` keys but **not** for `secret` keys — the `api_key` field for a secret is a non-functional placeholder of the right shape and prefix. Probing with it produces a bare `401` from every endpoint, which is indistinguishable from a revoked key.

This caused a real misdiagnosis: a working secret key was reported as broken and deleted on that basis. Secret key material is shown once, in the dashboard, and cannot be re-read. **Verify a secret key only through something that already holds it** — an Edge Function call, or the application itself.

**Why set it manually anyway:** the runtime's auto-injected variable has changed format before, silently, and broke `auth.admin`. An explicitly set secret is one you control and can verify.

**When the key is rotated:** update this secret in the same maintenance window, or every Edge Function breaks — both `create-user` and `public-checkin` read it, so user creation and all public QR check-in fail together. Rotating in the Supabase dashboard does *not* update function secrets automatically.

**Client-side counterpart:** `VITE_SUPABASE_ANON_KEY` now holds the `sb_publishable_*` value. Publishable keys are public by design, exactly as the anon key was — see §13.

---

## 5. Auth trigger — `handle_new_user` must not exist

**Rule:** There must be no `handle_new_user` trigger on `auth.users`. If found, drop it.

```sql
drop trigger if exists handle_new_user on auth.users;
drop function if exists public.handle_new_user();
```

Verify absence before any user-creation work:
```sql
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

**Why:** The trigger caused an `unexpected_failure` on every `auth.admin.createUser` call. Profile rows are created explicitly by the `create-user` Edge Function after the auth user exists, not via trigger.

---

## 6. Foreign key on `user_profiles` — deferrable

**Rule:** `user_profiles.id → auth.users(id)` must be `DEFERRABLE INITIALLY DEFERRED`.

```sql
alter table user_profiles
  add constraint user_profiles_id_fkey
  foreign key (id) references auth.users(id)
  deferrable initially deferred;
```

**Why:** The Edge Function creates the auth user then immediately inserts the profile row. A non-deferred constraint fires before commit and raises a violation. Deferred checks at commit, by which point both rows exist.

---

## 7. Schema changes go in a numbered migration first

**Rule:** No DDL through the Supabase SQL editor or dashboard without a corresponding numbered file in `supabase/migrations/`. The file is the blueprint; the database is its output.

**Test:** if the database died tomorrow, could it be rebuilt from `supabase/migrations/` alone? Today the answer is no — see `WOODLANDS_FOLLOWUPS.md`. Do not add to that debt.

**`supabase db push` is currently unsafe on this project.** Remote migration history records only 001–007 although 008–021 have run; a push would replay `016_staff_restructure.sql` and duplicate all 62 real staff rows. Apply migrations through the SQL editor until the history is repaired (Sprint D).

**Authoritative:** `STREAMLINE_BUILD_STANDARD.md` §2.6.

---

## 8. Vercel SPA routing

**Rule:** `vercel.json` must always contain the catch-all rewrite:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

**Why:** Vercel serves static files by path. Without it, any URL other than `/` 404s on hard refresh or direct navigation.

---

## 9. Shared constants

**Rule:** Units, roles, departments and any repeated dropdown values are defined once — roles in `src/lib/roles.js`, the rest in `src/lib/constants.js` — and imported. Never hardcoded inline.

**Why:** Inline lists drift. `WOODLANDS_AUDIT_2.md` §4.1 found three gates still keyed to `store_supervisor`, a role deleted from `roles.js` in June, permanently denying Log Delivery and Transfers to every role that can exist.

---

## 10. Column naming conventions

**Rule:** Always these names — no alternatives:

- **British spelling:** `organiser`, not `organizer`
- **Customer-facing bookings:** `guest_name`, `guest_phone`, `guest_email`
- **State with more than two values:** `status text` with a `CHECK` constraint — never `is_active boolean`
- **Internal staff notes:** `notes` — never `description`
- **Entity name:** `name` — never `title`
- **Phone fields:** international format, stored as `text`
- **`user_profiles` role column is `role`** — not `user_role`

**Departments are plain text everywhere.** Never a FK to a `departments` table.

**Why:** Inconsistent naming causes query mismatches and subtle bugs when data is shared between views.

---

## 11. Seed data rules

**Rule:**

- Cast date strings explicitly: `'2026-05-30'::date`, never bare `'2026-05-30'`
- Never use `ON CONFLICT` unless the constraint is confirmed to exist:
```sql
SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'x';
```
- Seed scripts read secrets from the environment and **throw if unset**. No hardcoded key, no `?? 'eyJ...'` fallback. `scripts/seed-attendance.mjs` carried one into git history and it cost a key rotation.

---

## 12. Reports are built last

**Rule:** The Reports module is built after all other modules are complete.

**Why:** Reports need full visibility of all data sources. Building them against half-formed schemas guarantees rework.

---

## 13. Environment variables

**Rule:** Exactly two variables, in both `.env.local` and Vercel:

```
VITE_SUPABASE_URL=https://[project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

- `VITE_SUPABASE_URL` must be the full URL including `https://`, not just the project ref.
- **`VITE_SUPABASE_ANON_KEY` holds the `sb_publishable_*` key, not a JWT.** Legacy JWT API keys were disabled on 26 July 2026; the old `eyJ…` anon key returns a bare `401` from PostgREST. The variable keeps its historical name to avoid a rename across the codebase.
- **Keep `.env.local` and Vercel in sync.** They are set independently. A stale `.env.local` breaks local dev only — the deployed bundle uses Vercel's values — and vice versa. This drifted once already, on the day of the key migration.
- **There is no third variable.** `VITE_SUPABASE_SERVICE_ROLE_KEY` was removed in Sprint B and must not return. If you find yourself adding a `VITE_*` variable to make a query work, the actual problem is a missing GRANT or policy — see §2.
- Edge Function secrets are set separately, in the Supabase dashboard, and use `SERVICE_ROLE_KEY` — see §4.
