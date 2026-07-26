-- 022_sprint_b_policies.sql
-- Sprint B / Task 3 prerequisite — the rest of the RLS surface.
--
-- Governing doctrine: STREAMLINE_BUILD_STANDARD.md v1.5 §2.2.
-- ADDITIVE ONLY. Nothing is created, altered or dropped. Policies and grants only.
-- Idempotent: DROP POLICY IF EXISTS precedes every CREATE POLICY.
--
-- ------------------------------------------------------------------
-- WHY THIS EXISTS
-- ------------------------------------------------------------------
-- Migration 021 (Sprint A) covered nine tables. The sprint brief assumed the
-- remainder would need at most occasional patching. A live query of policies
-- AND grants across all 27 public tables says otherwise: fourteen more tables
-- are unusable by the anon client as they stand.
--
-- Two distinct defects, and most tables have both:
--
--   1. MISSING GRANTS. `authenticated` holds only REFERENCES/TRIGGER/TRUNCATE
--      on eleven tables — no SELECT, INSERT or UPDATE. Their existing
--      "authenticated read <t>" policies are therefore unreachable: the grant
--      is checked before the policy, so the query fails with permission denied
--      and the policy never runs. This is invisible while the browser uses a
--      service-role client, because Supabase grants DML to service_role by
--      default. It surfaces the instant supabaseAdmin is removed.
--      Same defect Sprint A found on event_checklists, shift_settings, tables.
--
--   2. MISSING WRITE POLICIES. Every table below had at most a SELECT policy.
--      event_configurations, event_staff and event_stock_allocations had no
--      authenticated policy of any kind.
--
-- ------------------------------------------------------------------
-- ACCESS MATRIX — derived from the current UI, not invented
-- ------------------------------------------------------------------
-- Route roles authoritative in src/lib/roles.js. Component gates read directly.
--
--   current_stock            I/U  owner,manager    InventoryUI.jsx:97 (upsert -> needs BOTH),
--                                                  AdjustmentsTab.jsx:51, EventDetailTab.jsx:80,:101,
--                                                  EventStockSection.jsx:99,:152
--   stock_movements          I    owner,manager    LogDeliveryTab.jsx:39, TransfersTab.jsx:56,
--                                                  RequisitionsTab.jsx:75, AdjustmentsTab.jsx:42
--   requisitions             I    all four         RequisitionsTab.jsx:45 — raising is open to every
--                                                  role on the inventory route
--                            U    owner,manager    :63,:84,:93 approve/fulfil/reject (MANAGERS gate)
--   departments              I/U/D owner           DepartmentsTab.jsx:24,:36,:47 — /admin is owner-only
--   stock_items              I/U  owner            StockItemsTab.jsx:55,:74,:89 — /admin. No delete path.
--   event_bill_items         I/D  owner,manager    EventBillSection.jsx:40,:57
--   event_configurations     I/U  owner,manager    CreateEventTab.jsx:74, EventSetupSection.jsx:94,:98
--   event_staff              I/D  owner,manager    EventStaffSection.jsx:51,:69
--   event_stock_allocations  I/U/D owner,manager   EventStockSection.jsx:83,:105,:122,:157,
--                                                  EventDetailTab.jsx:85,:106,:112
--   fm_holders               I/U  owner,manager    AddHolderTab.jsx:54, HoldersTab.jsx:125,:217,:226,
--                                                  :234,:266, PaymentsTab.jsx:150,:153
--   fm_visits                I/U/D owner,manager   MarketDayTab.jsx:106,:122,:147,:164,:182,
--                                                  PaymentsTab.jsx:156
--   fm_payments              I/D  owner,manager    HoldersTab.jsx:315,:329, MarketDayTab.jsx:139,:165,
--                                                  PaymentsTab.jsx:137
--   fm_id_cards              I/U  owner,manager    HoldersTab.jsx:307,:327
--   fm_approved_items        I/D  owner,manager    HoldersTab.jsx:360,:376
--
-- Farmers Market and Events components gate on ['owner','manager']
-- (FM_MANAGE_ROLES / canManage), matching ROUTE_ACCESS for /farmers-market
-- and /events. Inventory writes go through tabs gated to owner/manager;
-- LogDeliveryTab and TransfersTab also list 'store_supervisor', a role that
-- no longer exists in roles.js — it is deliberately NOT granted here.
-- Deleting those dead gates is Sprint E.
--
-- SELECT stays open to all authenticated roles throughout: OwnerDashboard
-- (/dashboard, all four roles) reads across every module, and the read
-- policies already in place are USING (true).
--
-- NOT COVERED HERE:
--   fm_market_days  — does not exist in the live database. Sprint D.
--   attendance_records — already has a full authenticated policy set.
--   the four dead tables (inventory_items, deliveries, stock_transfers,
--     stock_adjustments) — unused by src/, dropped in Sprint D.


-- ==================================================================
-- INVENTORY
-- ==================================================================

-- current_stock — upsert needs INSERT and UPDATE together
GRANT SELECT, INSERT, UPDATE ON current_stock TO authenticated;

DROP POLICY IF EXISTS "current_stock_manage_insert" ON current_stock;
CREATE POLICY "current_stock_manage_insert" ON current_stock
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "current_stock_manage_update" ON current_stock;
CREATE POLICY "current_stock_manage_update" ON current_stock
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

-- stock_movements — append-only ledger; no update or delete path in the UI
GRANT SELECT, INSERT ON stock_movements TO authenticated;

DROP POLICY IF EXISTS "stock_movements_manage_insert" ON stock_movements;
CREATE POLICY "stock_movements_manage_insert" ON stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

-- requisitions — anyone on the inventory route may raise one;
-- only owner/manager may approve, fulfil or reject.
DROP POLICY IF EXISTS "requisitions_raise_insert" ON requisitions;
CREATE POLICY "requisitions_raise_insert" ON requisitions
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IS NOT NULL);

DROP POLICY IF EXISTS "requisitions_manage_update" ON requisitions;
CREATE POLICY "requisitions_manage_update" ON requisitions
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

-- stock_items — read by every module, written only from /admin
GRANT SELECT, INSERT, UPDATE ON stock_items TO authenticated;

DROP POLICY IF EXISTS "stock_items_owner_insert" ON stock_items;
CREATE POLICY "stock_items_owner_insert" ON stock_items
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() = 'owner');

DROP POLICY IF EXISTS "stock_items_owner_update" ON stock_items;
CREATE POLICY "stock_items_owner_update" ON stock_items
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() = 'owner')
  WITH CHECK (public.current_app_role() = 'owner');


-- ==================================================================
-- ADMIN
-- ==================================================================

-- departments — plain-text references elsewhere; this table is the picker source
GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO authenticated;

DROP POLICY IF EXISTS "departments_owner_insert" ON departments;
CREATE POLICY "departments_owner_insert" ON departments
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() = 'owner');

DROP POLICY IF EXISTS "departments_owner_update" ON departments;
CREATE POLICY "departments_owner_update" ON departments
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() = 'owner')
  WITH CHECK (public.current_app_role() = 'owner');

DROP POLICY IF EXISTS "departments_owner_delete" ON departments;
CREATE POLICY "departments_owner_delete" ON departments
  FOR DELETE TO authenticated
  USING (public.current_app_role() = 'owner');


-- ==================================================================
-- EVENTS
-- ==================================================================

-- event_bill_items
GRANT SELECT, INSERT, UPDATE, DELETE ON event_bill_items TO authenticated;

DROP POLICY IF EXISTS "event_bill_items_manage_insert" ON event_bill_items;
CREATE POLICY "event_bill_items_manage_insert" ON event_bill_items
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "event_bill_items_manage_delete" ON event_bill_items;
CREATE POLICY "event_bill_items_manage_delete" ON event_bill_items
  FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('owner', 'manager'));

-- event_configurations — had NO authenticated policy at all
GRANT SELECT, INSERT, UPDATE ON event_configurations TO authenticated;

DROP POLICY IF EXISTS "authenticated_read_event_configurations" ON event_configurations;
CREATE POLICY "authenticated_read_event_configurations" ON event_configurations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "event_configurations_manage_insert" ON event_configurations;
CREATE POLICY "event_configurations_manage_insert" ON event_configurations
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "event_configurations_manage_update" ON event_configurations;
CREATE POLICY "event_configurations_manage_update" ON event_configurations
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

-- event_staff — had NO authenticated policy at all
GRANT SELECT, INSERT, DELETE ON event_staff TO authenticated;

DROP POLICY IF EXISTS "authenticated_read_event_staff" ON event_staff;
CREATE POLICY "authenticated_read_event_staff" ON event_staff
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "event_staff_manage_insert" ON event_staff;
CREATE POLICY "event_staff_manage_insert" ON event_staff
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "event_staff_manage_delete" ON event_staff;
CREATE POLICY "event_staff_manage_delete" ON event_staff
  FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('owner', 'manager'));

-- event_stock_allocations — had NO authenticated policy at all
GRANT SELECT, INSERT, UPDATE, DELETE ON event_stock_allocations TO authenticated;

DROP POLICY IF EXISTS "authenticated_read_event_stock_allocations" ON event_stock_allocations;
CREATE POLICY "authenticated_read_event_stock_allocations" ON event_stock_allocations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "event_stock_allocations_manage_insert" ON event_stock_allocations;
CREATE POLICY "event_stock_allocations_manage_insert" ON event_stock_allocations
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "event_stock_allocations_manage_update" ON event_stock_allocations;
CREATE POLICY "event_stock_allocations_manage_update" ON event_stock_allocations
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "event_stock_allocations_manage_delete" ON event_stock_allocations;
CREATE POLICY "event_stock_allocations_manage_delete" ON event_stock_allocations
  FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('owner', 'manager'));


-- ==================================================================
-- FARMERS MARKET
-- ==================================================================
-- Note: the anon role is granted nothing here. Public /checkin goes through
-- the public-checkin Edge Function, which holds service_role server-side.
-- There are deliberately zero anon policies in this database.

-- fm_holders
GRANT SELECT, INSERT, UPDATE ON fm_holders TO authenticated;

DROP POLICY IF EXISTS "fm_holders_manage_insert" ON fm_holders;
CREATE POLICY "fm_holders_manage_insert" ON fm_holders
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "fm_holders_manage_update" ON fm_holders;
CREATE POLICY "fm_holders_manage_update" ON fm_holders
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

-- fm_visits
GRANT SELECT, INSERT, UPDATE, DELETE ON fm_visits TO authenticated;

DROP POLICY IF EXISTS "fm_visits_manage_insert" ON fm_visits;
CREATE POLICY "fm_visits_manage_insert" ON fm_visits
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "fm_visits_manage_update" ON fm_visits;
CREATE POLICY "fm_visits_manage_update" ON fm_visits
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "fm_visits_manage_delete" ON fm_visits;
CREATE POLICY "fm_visits_manage_delete" ON fm_visits
  FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('owner', 'manager'));

-- fm_payments
GRANT SELECT, INSERT, DELETE ON fm_payments TO authenticated;

DROP POLICY IF EXISTS "fm_payments_manage_insert" ON fm_payments;
CREATE POLICY "fm_payments_manage_insert" ON fm_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "fm_payments_manage_delete" ON fm_payments;
CREATE POLICY "fm_payments_manage_delete" ON fm_payments
  FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('owner', 'manager'));

-- fm_id_cards
GRANT SELECT, INSERT, UPDATE ON fm_id_cards TO authenticated;

DROP POLICY IF EXISTS "fm_id_cards_manage_insert" ON fm_id_cards;
CREATE POLICY "fm_id_cards_manage_insert" ON fm_id_cards
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "fm_id_cards_manage_update" ON fm_id_cards;
CREATE POLICY "fm_id_cards_manage_update" ON fm_id_cards
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

-- fm_approved_items
GRANT SELECT, INSERT, DELETE ON fm_approved_items TO authenticated;

DROP POLICY IF EXISTS "fm_approved_items_manage_insert" ON fm_approved_items;
CREATE POLICY "fm_approved_items_manage_insert" ON fm_approved_items
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "fm_approved_items_manage_delete" ON fm_approved_items;
CREATE POLICY "fm_approved_items_manage_delete" ON fm_approved_items
  FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('owner', 'manager'));
