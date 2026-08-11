-- 044_rls_shift_settings.sql
-- Phase 2 RLS, part 6b: shift_settings.
--
-- This table was missed by 038-043 and caught by the post-migration sweep for
-- policies still naming a retired role. Its three manage policies still read
-- ('owner','manager'), so with `manager` gone the renamed admin user had
-- silently LOST shift write — a regression, not a tightening.
--
-- Target: read and write owner + admin + hr. hr owns the roster and the shift
-- schedule per the Phase 2 decision ("shift_settings (write)"). Nothing a
-- department_head can reach reads this table: AttendanceUI's SettingsTab is
-- AT_MANAGE_ROLES-gated and AddUserTab's shift lookup is on the owner-only
-- /admin page.
--
-- Also removes the duplicates this table accumulated: two service_role ALL
-- policies and two blanket authenticated reads.

begin;

create policy "shift_settings_manage_select" on public.shift_settings
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin', 'hr'));

create policy "shift_settings_manage_insert_v2" on public.shift_settings
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin', 'hr'));

create policy "shift_settings_manage_update_v2" on public.shift_settings
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin', 'hr'))
  with check (public.current_app_role() in ('owner', 'admin', 'hr'));

create policy "shift_settings_manage_delete_v2" on public.shift_settings
  for delete to authenticated
  using (public.current_app_role() in ('owner', 'admin', 'hr'));

drop policy if exists "authenticated read shift_settings"        on public.shift_settings;
drop policy if exists "authenticated_read_shift_settings"        on public.shift_settings;
drop policy if exists "shift_settings_manage_insert"             on public.shift_settings;
drop policy if exists "shift_settings_manage_update"             on public.shift_settings;
drop policy if exists "shift_settings_manage_delete"             on public.shift_settings;
drop policy if exists "service role full access shift_settings"  on public.shift_settings;

commit;
