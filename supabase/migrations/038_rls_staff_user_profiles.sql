-- 038_rls_staff_user_profiles.sql
-- Phase 2 RLS, part 1 of 6: the roster and the profile table.
--
-- These two are a SHAPE change, not a role-list swap. Both carried a blanket
-- `authenticated read ... USING (true)`, so before this migration every login
-- role could read all 62 staff rows and all 4 profiles. Because policies are
-- OR'd, no amount of scoping elsewhere means anything while a blanket read
-- survives — it has to be replaced, not supplemented.
--
-- Target:
--   staff          read  owner, admin, hr        write owner, hr
--   user_profiles  read  own row (ALWAYS) + owner, admin, hr
--                  write owner only (unchanged)
--
-- hr gets staff write per the Phase 2 decision. NOTE: StaffTab.jsx is mounted
-- on /admin, which is owner-only, so hr currently has no reachable UI for it.
-- Recorded in WOODLANDS_FOLLOWUPS.md — the grant is correct, the surface is
-- missing.
--
-- The own-row read on user_profiles is load-bearing, not a nicety:
-- AuthContext.fetchProfile() and Login.jsx both read this table through the
-- anon client under RLS. Without it, department_head resolves profile = null,
-- every role gate evaluates undefined, and the account cannot use the app at
-- all. current_app_role() is SECURITY DEFINER (migration 021) so a policy on
-- user_profiles may call it without recursing.
--
-- Create-then-drop per table, so the window is briefly over-permissive rather
-- than briefly closed. The whole file is one transaction, so neither is
-- observable.

begin;

-- ── staff ────────────────────────────────────────────────────────────────────

create policy "staff_manage_select" on public.staff
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin', 'hr'));

create policy "staff_manage_insert" on public.staff
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'hr'));

create policy "staff_manage_update" on public.staff
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'hr'))
  with check (public.current_app_role() in ('owner', 'hr'));

drop policy if exists "authenticated_read_staff" on public.staff;
drop policy if exists "staff_owner_insert"       on public.staff;
drop policy if exists "staff_owner_update"       on public.staff;

-- No DELETE policy: StaffTab deactivates via is_active, it never deletes.

-- ── user_profiles ────────────────────────────────────────────────────────────

-- Own row, every role, unconditionally. This is what keeps login working.
create policy "user_profiles_own_select" on public.user_profiles
  for select to authenticated
  using (id = auth.uid());

create policy "user_profiles_manage_select" on public.user_profiles
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin', 'hr'));

drop policy if exists "authenticated can read profiles"    on public.user_profiles;
drop policy if exists "authenticated_read_user_profiles"   on public.user_profiles;

-- user_profiles_owner_update is left exactly as it is: role and is_active are
-- owner-only, and UsersTab lives on the owner-only /admin page. hr reads
-- profiles, it does not edit them.

commit;
