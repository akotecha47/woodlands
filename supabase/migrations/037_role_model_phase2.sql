-- 037_role_model_phase2.sql
-- Phase 2 role model — data migration + department helper.
--
-- Renames `manager` to `admin` and retires `kitchen_manager` /
-- `restaurant_manager` in favour of `department_head` scoped by the existing
-- user_profiles.department text column. Authoritative role list is
-- src/lib/roles.js (APP_ROLES) and supabase/functions/create-user/index.ts
-- (ALLOWED_ROLES, hand-synced duplicate).
--
-- Final roles: owner, admin, department_head, hr.
--
-- The POLICIES that consume these values are rewritten in 038-043. This file
-- only moves the four live rows and adds the helper those policies need.
-- Between this migration and 043 the two renamed users cannot write (their
-- new role name matches no policy yet); reads are unaffected because every
-- table still carries a blanket authenticated read at that point.
--
-- user_profiles.role has no CHECK constraint (verified 11 August 2026), so
-- these are plain text updates.

begin;

-- ── 1. The four live rows ────────────────────────────────────────────────────
-- Matched on auth.users.email, not user_profiles.email: the kitchen row's
-- profile email is NULL (pre-existing data gap, out of scope here), so the
-- profile table cannot identify it on its own.

update public.user_profiles p
   set role       = 'admin',
       updated_at = now()
  from auth.users u
 where u.id = p.id
   and u.email = 'manager@woodlands.com'
   and p.role  = 'manager';

update public.user_profiles p
   set role       = 'department_head',
       department = 'Kitchen',
       updated_at = now()
  from auth.users u
 where u.id = p.id
   and u.email = 'kitchen@woodlands.com'
   and p.role  = 'kitchen_manager';

update public.user_profiles p
   set role       = 'department_head',
       department = 'Restaurant',
       updated_at = now()
  from auth.users u
 where u.id = p.id
   and u.email = 'restaurant@woodlands.com'
   and p.role  = 'restaurant_manager';

-- owner@woodlands.com is unchanged by design.

-- ── 2. Fail closed if anything did not land ──────────────────────────────────
-- A silent no-match here would leave a user holding a retired role that no
-- policy in 038-043 grants, i.e. locked out. Abort instead.
do $$
declare
  bad int;
begin
  select count(*) into bad
    from public.user_profiles
   where role not in ('owner', 'admin', 'department_head', 'hr');
  if bad > 0 then
    raise exception 'Role migration incomplete: % row(s) still hold a retired role', bad;
  end if;

  select count(*) into bad
    from public.user_profiles
   where role = 'department_head'
     and (department is null or department = '');
  if bad > 0 then
    raise exception '% department_head row(s) have no department — they would see nothing', bad;
  end if;
end $$;

-- ── 3. Department helper for the scoped policies in 039 ──────────────────────
-- Same shape and rationale as public.current_app_role() (migration 021):
-- SECURITY DEFINER so a policy may consult user_profiles without recursing,
-- STABLE so the planner can hoist it, search_path pinned so it cannot be
-- hijacked by a caller-set path. Returns NULL for a deactivated profile,
-- which makes every `= current_app_department()` predicate false.
create or replace function public.current_app_department()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select up.department
    from public.user_profiles up
   where up.id = auth.uid()
     and up.is_active is distinct from false
$$;

revoke all on function public.current_app_department() from public;
grant execute on function public.current_app_department() to authenticated, service_role;

commit;
