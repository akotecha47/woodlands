-- 040_rls_events.sql
-- Phase 2 RLS, part 3 of 6: the seven events tables.
--
-- Target for all seven: read and write owner + admin. admin explicitly
-- includes event_payments WRITE (the Phase 2 decision widens `manager`'s old
-- surface rather than narrowing it). hr has no events access — "no revenue" —
-- and department_head has none either.
--
-- Each table keeps the operation shape it already had; only the role list and
-- the read policy change:
--   events, event_stock_allocations   insert / update / delete
--   event_bill_items, event_staff     insert / delete   (no update policy,
--                                     and event_staff has no UPDATE grant)
--   event_checklists, event_configurations, event_payments
--                                     insert / update   (no delete)
--
-- This file also drops duplicate policies left by overlapping migrations:
-- events, event_payments and event_checklists each carried two service_role
-- ALL policies and two blanket authenticated reads. One service_role policy
-- per table is kept.

begin;

-- ── events ───────────────────────────────────────────────────────────────────
create policy "events_manage_select" on public.events
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "events_manage_insert_v2" on public.events
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "events_manage_update_v2" on public.events
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "events_manage_delete_v2" on public.events
  for delete to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated read events"      on public.events;
drop policy if exists "authenticated_read_events"      on public.events;
drop policy if exists "events_manage_insert"           on public.events;
drop policy if exists "events_manage_update"           on public.events;
drop policy if exists "events_manage_delete"           on public.events;
drop policy if exists "service role full access events" on public.events;

-- ── event_bill_items ─────────────────────────────────────────────────────────
create policy "event_bill_items_manage_select" on public.event_bill_items
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "event_bill_items_manage_insert_v2" on public.event_bill_items
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "event_bill_items_manage_delete_v2" on public.event_bill_items
  for delete to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated read event_bill_items"   on public.event_bill_items;
drop policy if exists "event_bill_items_manage_insert"        on public.event_bill_items;
drop policy if exists "event_bill_items_manage_delete"        on public.event_bill_items;

-- ── event_checklists ─────────────────────────────────────────────────────────
create policy "event_checklists_manage_select" on public.event_checklists
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "event_checklists_manage_insert_v2" on public.event_checklists
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "event_checklists_manage_update_v2" on public.event_checklists
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated read event_checklists"        on public.event_checklists;
drop policy if exists "authenticated_read_event_checklists"        on public.event_checklists;
drop policy if exists "event_checklists_manage_insert"             on public.event_checklists;
drop policy if exists "event_checklists_manage_update"             on public.event_checklists;
drop policy if exists "service role full access event_checklists"  on public.event_checklists;

-- ── event_configurations ─────────────────────────────────────────────────────
create policy "event_configurations_manage_select" on public.event_configurations
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "event_configurations_manage_insert_v2" on public.event_configurations
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "event_configurations_manage_update_v2" on public.event_configurations
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated_read_event_configurations"  on public.event_configurations;
drop policy if exists "event_configurations_manage_insert"       on public.event_configurations;
drop policy if exists "event_configurations_manage_update"       on public.event_configurations;

-- ── event_payments ───────────────────────────────────────────────────────────
-- Revenue. admin writes these by decision; hr must not even read them.
create policy "event_payments_manage_select" on public.event_payments
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "event_payments_manage_insert_v2" on public.event_payments
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "event_payments_manage_update_v2" on public.event_payments
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated read event_payments"        on public.event_payments;
drop policy if exists "authenticated_read_event_payments"        on public.event_payments;
drop policy if exists "event_payments_manage_insert"             on public.event_payments;
drop policy if exists "event_payments_manage_update"             on public.event_payments;
drop policy if exists "service role full access event_payments"  on public.event_payments;

-- ── event_staff ──────────────────────────────────────────────────────────────
create policy "event_staff_manage_select" on public.event_staff
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "event_staff_manage_insert_v2" on public.event_staff
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "event_staff_manage_delete_v2" on public.event_staff
  for delete to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated_read_event_staff"  on public.event_staff;
drop policy if exists "event_staff_manage_insert"       on public.event_staff;
drop policy if exists "event_staff_manage_delete"       on public.event_staff;

-- ── event_stock_allocations ──────────────────────────────────────────────────
create policy "event_stock_allocations_manage_select" on public.event_stock_allocations
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "event_stock_allocations_manage_insert_v2" on public.event_stock_allocations
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "event_stock_allocations_manage_update_v2" on public.event_stock_allocations
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "event_stock_allocations_manage_delete_v2" on public.event_stock_allocations
  for delete to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated_read_event_stock_allocations" on public.event_stock_allocations;
drop policy if exists "event_stock_allocations_manage_insert"      on public.event_stock_allocations;
drop policy if exists "event_stock_allocations_manage_update"      on public.event_stock_allocations;
drop policy if exists "event_stock_allocations_manage_delete"      on public.event_stock_allocations;

commit;
