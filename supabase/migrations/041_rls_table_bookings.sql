-- 041_rls_table_bookings.sql
-- Phase 2 RLS, part 4 of 6: table bookings.
--
-- table_bookings previously granted write to owner + manager +
-- restaurant_manager. restaurant_manager is retired, and the person who held
-- it is now a Restaurant department_head, which is NOT a bookings role — so
-- this is the one table where a real user's capability is deliberately
-- REMOVED rather than renamed. Bookings are an admin/front-desk surface
-- (ROUTE_ACCESS['/table-bookings'] = TB_MANAGE_ROLES = owner, admin).
--
-- `tables` is the restaurant's table list. It had no role-based policy at all,
-- two duplicate service_role policies and two duplicate blanket reads. Every
-- screen that reads it (AllBookingsTab, UpcomingTab, table-bookings TodayTab)
-- is owner/admin-gated, so it is restricted to match and de-duplicated.
-- `tables` has no INSERT/UPDATE/DELETE grant to authenticated, so read is the
-- only policy it needs.

begin;

-- ── table_bookings ───────────────────────────────────────────────────────────
create policy "table_bookings_manage_select" on public.table_bookings
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "table_bookings_manage_insert_v2" on public.table_bookings
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "table_bookings_manage_update_v2" on public.table_bookings
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated_read_table_bookings" on public.table_bookings;
drop policy if exists "table_bookings_manage_insert"      on public.table_bookings;
drop policy if exists "table_bookings_manage_update"      on public.table_bookings;

-- ── tables ───────────────────────────────────────────────────────────────────
create policy "tables_manage_select" on public.tables
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated read tables"        on public.tables;
drop policy if exists "authenticated_read_tables"        on public.tables;
drop policy if exists "service role full access tables"  on public.tables;

commit;
