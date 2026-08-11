-- 042_rls_farmers_market.sql
-- Phase 2 RLS, part 5 of 6: the six Farmers Market tables.
--
-- Target for all six: read and write owner + admin. hr has no Farmers Market
-- access by decision, and department_head has none either.
--
-- These tables hold stallholder PII (305 real holders: names, phones, emails),
-- so the blanket authenticated read being dropped here is the most valuable
-- part of this file — before it, any logged-in account could read all 305.
--
-- The public QR check-in path is NOT affected: supabase/functions/
-- public-checkin runs on the service_role key, and each table keeps its
-- service_role ALL policy. That function remains the only unauthenticated
-- route to holder data, and it returns a minimum field set by design
-- (standards.md §3).
--
-- Operation shapes are preserved as found:
--   fm_holders, fm_id_cards, fm_market_days   insert / update
--   fm_approved_items, fm_payments            insert / delete
--   fm_visits                                 insert / update / delete

begin;

-- ── fm_holders ───────────────────────────────────────────────────────────────
create policy "fm_holders_manage_select" on public.fm_holders
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "fm_holders_manage_insert_v2" on public.fm_holders
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "fm_holders_manage_update_v2" on public.fm_holders
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated read fm_holders" on public.fm_holders;
drop policy if exists "fm_holders_manage_insert"      on public.fm_holders;
drop policy if exists "fm_holders_manage_update"      on public.fm_holders;

-- ── fm_visits ────────────────────────────────────────────────────────────────
create policy "fm_visits_manage_select" on public.fm_visits
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "fm_visits_manage_insert_v2" on public.fm_visits
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "fm_visits_manage_update_v2" on public.fm_visits
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "fm_visits_manage_delete_v2" on public.fm_visits
  for delete to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated read fm_visits" on public.fm_visits;
drop policy if exists "fm_visits_manage_insert"      on public.fm_visits;
drop policy if exists "fm_visits_manage_update"      on public.fm_visits;
drop policy if exists "fm_visits_manage_delete"      on public.fm_visits;

-- ── fm_payments ──────────────────────────────────────────────────────────────
create policy "fm_payments_manage_select" on public.fm_payments
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "fm_payments_manage_insert_v2" on public.fm_payments
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "fm_payments_manage_delete_v2" on public.fm_payments
  for delete to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated read fm_payments" on public.fm_payments;
drop policy if exists "fm_payments_manage_insert"      on public.fm_payments;
drop policy if exists "fm_payments_manage_delete"      on public.fm_payments;

-- ── fm_id_cards ──────────────────────────────────────────────────────────────
create policy "fm_id_cards_manage_select" on public.fm_id_cards
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "fm_id_cards_manage_insert_v2" on public.fm_id_cards
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "fm_id_cards_manage_update_v2" on public.fm_id_cards
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated read fm_id_cards" on public.fm_id_cards;
drop policy if exists "fm_id_cards_manage_insert"      on public.fm_id_cards;
drop policy if exists "fm_id_cards_manage_update"      on public.fm_id_cards;

-- ── fm_approved_items ────────────────────────────────────────────────────────
create policy "fm_approved_items_manage_select" on public.fm_approved_items
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "fm_approved_items_manage_insert_v2" on public.fm_approved_items
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "fm_approved_items_manage_delete_v2" on public.fm_approved_items
  for delete to authenticated
  using (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated read fm_approved_items" on public.fm_approved_items;
drop policy if exists "fm_approved_items_manage_insert"      on public.fm_approved_items;
drop policy if exists "fm_approved_items_manage_delete"      on public.fm_approved_items;

-- ── fm_market_days ───────────────────────────────────────────────────────────
create policy "fm_market_days_manage_select" on public.fm_market_days
  for select to authenticated
  using (public.current_app_role() in ('owner', 'admin'));
create policy "fm_market_days_manage_insert_v2" on public.fm_market_days
  for insert to authenticated
  with check (public.current_app_role() in ('owner', 'admin'));
create policy "fm_market_days_manage_update_v2" on public.fm_market_days
  for update to authenticated
  using      (public.current_app_role() in ('owner', 'admin'))
  with check (public.current_app_role() in ('owner', 'admin'));

drop policy if exists "authenticated_read_fm_market_days" on public.fm_market_days;
drop policy if exists "fm_market_days_manage_insert"      on public.fm_market_days;
drop policy if exists "fm_market_days_manage_update"      on public.fm_market_days;

commit;
