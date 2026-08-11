-- 043_rls_attendance_role_model.sql
-- Phase 2 RLS, part 6 of 6: attendance_records.
--
-- This is the table Session B closed on 10 August (migration 036, which is the
-- single owner of these policies). It holds 15 real rows. The change here is
-- deliberately the smallest possible one: THE ROLE LIST ONLY. Same policy
-- names, same shape, same predicates, no new columns referenced, no blanket
-- policy introduced, still no DELETE policy.
--
--   before: current_app_role() IN ('owner', 'manager')
--   after:  current_app_role() IN ('owner', 'admin', 'hr')
--
-- hr manages the roster and gets read-all plus override (update), per the
-- Phase 2 decision. department_head is deliberately absent: attendance is NOT
-- department-scoped in this phase, so a head has no attendance access at all.
--
-- OWNER IS RETAINED. The Phase 2 brief said "attendance_records: admin + hr
-- ONLY" and also "admin+hr replaces owner+manager". Read literally the second
-- phrasing drops owner, which would contradict owner-sees-everything, would
-- disagree with AT_MANAGE_ROLES = ['owner','admin','hr'] in src/lib/roles.js,
-- and would leave owner able to open /attendance and see nothing. Owner is
-- kept; flagged for confirmation. If owner really must be excluded it is a
-- one-word edit to each of the three policies below.
--
-- The three attendance_own_* policies are untouched and still hold: any
-- authenticated user may insert/read/update their OWN row (user_id =
-- auth.uid()). Note all 15 live rows currently have user_id NULL, so those
-- policies match nothing today — `NULL = auth.uid()` is NULL, not true, which
-- is why they leak nothing.
--
-- 036 remains the historical owner of the policy set; this file supersedes
-- only the three manage_* role lists.

begin;

-- Create-then-drop, one operation at a time, so attendance is never left
-- without a manage policy.

create policy "attendance_manage_select_v2" on public.attendance_records
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin', 'hr'));

create policy "attendance_manage_insert_v2" on public.attendance_records
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin', 'hr'));

create policy "attendance_manage_update_v2" on public.attendance_records
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin', 'hr'))
  with check (public.current_app_role() in ('owner', 'admin', 'hr'));

drop policy if exists "attendance_manage_select" on public.attendance_records;
drop policy if exists "attendance_manage_insert" on public.attendance_records;
drop policy if exists "attendance_manage_update" on public.attendance_records;

-- Deliberately NOT created: any DELETE policy. Attendance history is not
-- deletable from the browser under any role, exactly as Session B left it.

commit;
