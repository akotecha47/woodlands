-- 021_sprint_a_policies.sql
-- Sprint A / Task 1 — RLS policy completion.
-- Governing doctrine: STREAMLINE_BUILD_STANDARD.md v1.5 §2.2.
--
-- ADDITIVE ONLY. No table is created, altered, or dropped here. The single
-- removal is the stale blanket policy from 004 on `staff` (see section 6),
-- which is explicitly in scope for this sprint.
--
-- Idempotent: every CREATE POLICY is preceded by DROP POLICY IF EXISTS, so
-- this file is safe to re-run.
--
-- ------------------------------------------------------------------
-- LIVE-DB RECONCILIATION NOTE (queried 2026-07-26, before writing this file)
-- ------------------------------------------------------------------
-- WOODLANDS_AUDIT_2.md §2.2 reported `events`, `event_payments` and
-- `table_bookings` as having ZERO policies. That was a source-only reading.
-- Against the live database:
--
--   * events, event_payments  -> already carry "service role full access {t}"
--                                (ALL/service_role) and "authenticated read {t}"
--                                (SELECT/authenticated). Only the write
--                                policies were missing.
--   * table_bookings          -> genuinely ZERO policies. Confirmed.
--   * user_profiles           -> already carries a service_role ALL policy
--                                ("service role full access on user_profiles")
--                                plus SELECT/authenticated. UPDATE was missing.
--   * event_checklists,
--     shift_settings, tables  -> EXIST in the live DB (§2.6 "ghost" tables),
--                                RLS enabled, SELECT/authenticated +
--                                ALL/service_role present. Their CREATE TABLE
--                                statements remain absent from any migration —
--                                that is Sprint D, not this file. Their missing
--                                write policies AND missing authenticated
--                                GRANTs are fixed here.
--   * fm_market_days          -> DOES NOT EXIST in the live database, in any
--                                relkind. MarketDayTab.jsx reads and writes it
--                                (:44, :199, :205), so that surface is broken
--                                today, not merely unmigrated. No policy can be
--                                written for a table that does not exist.
--                                Table creation is Sprint D.
--
-- The pre-existing service_role policies use legacy names
-- ("service role full access {t}"). Per the additive-only constraint they are
-- NOT dropped. The canonical "service_role_all_{t}" policies below therefore
-- sit alongside them. Both are permissive and identical in effect; collapsing
-- the duplicates is logged in WOODLANDS_FOLLOWUPS.md for Sprint D.
--
-- ------------------------------------------------------------------
-- ACCESS MATRIX — derived from the current UI, not invented
-- ------------------------------------------------------------------
-- Route roles are authoritative in src/lib/roles.js.
--
--   events            SELECT  all authenticated  (OwnerDashboard.jsx:91, /dashboard = 4 roles)
--                     I/U/D   owner, manager     (/events; EventsListTab.jsx:179,:207,
--                                                 CreateEventTab.jsx:53, EventDetailTab.jsx:127)
--   event_payments    SELECT  all authenticated  (OwnerDashboard.jsx:110)
--                     I/U     owner, manager     (EventPaymentsSection.jsx:62)
--   table_bookings    SELECT  all authenticated  (OwnerDashboard.jsx:97)
--                     I/U     owner, manager, restaurant_manager
--                                                (TB_MANAGE_ROLES, TableBookingsUI.jsx:1;
--                                                 TodayTab.jsx:58, NewBookingTab.jsx:87,
--                                                 AllBookingsTab.jsx:78,:102, UpcomingTab.jsx:81)
--   user_profiles     SELECT  all authenticated  (AuthContext.jsx:8, Login.jsx:26, name lookups)
--                     UPDATE  owner              (UsersTab.jsx:62,:76 — /admin is owner-only)
--                     INSERT  service_role only  (create-user Edge Function; the browser never
--                                                 inserts a profile, so no authenticated policy)
--   staff             SELECT  all authenticated  (attendance TodayTab/HistoryTab, EventStaffSection)
--                     I/U     owner              (StaffTab.jsx:83,:87,:101,:114 — /admin only)
--   event_checklists  SELECT  all authenticated  (EventDetailTab.jsx:34)
--                     I/U     owner, manager     (EventsUI.jsx:165, EventDetailTab.jsx:148)
--   shift_settings    SELECT  all authenticated  (ClockInOutTab, TodayTab, HistoryTab,
--                                                 AddUserTab.jsx:27, UsersTab.jsx:29)
--                     I/U/D   owner, manager     (SettingsTab.jsx:53,:77,:98 — /attendance)
--   tables            SELECT  all authenticated  (all four table-bookings tabs)
--                     no writes — nothing in src/ writes `tables`
--
-- No DELETE policy is written for event_payments, table_bookings, staff,
-- user_profiles or event_checklists: no UI path deletes from them
-- (cancellation and deactivation are UPDATEs).
--
-- NOTE ON PRESENT BEHAVIOUR: every one of these components currently issues its
-- query through the browser service_role client (supabaseAdmin), which bypasses
-- RLS entirely. These policies therefore change nothing observable today — they
-- are the prerequisite that lets Sprint B remove that client without breaking
-- Events and Table Bookings.


-- ==================================================================
-- 0. ROLE LOOKUP HELPER
-- ==================================================================
-- SECURITY DEFINER so that policies ON user_profiles can consult
-- user_profiles without triggering RLS recursion.
--
-- Returns NULL for a deactivated profile, so `is_active = false` revokes
-- data access at the database, not only in the router (Sprint A / Task 3).

CREATE OR REPLACE FUNCTION public.current_app_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT up.role
    FROM public.user_profiles up
   WHERE up.id = auth.uid()
     AND up.is_active IS DISTINCT FROM false
$$;

REVOKE ALL     ON FUNCTION public.current_app_role() FROM public;
GRANT  EXECUTE ON FUNCTION public.current_app_role() TO authenticated, service_role;


-- ==================================================================
-- 1. events
-- ==================================================================
GRANT ALL ON events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON events TO authenticated;

DROP POLICY IF EXISTS "service_role_all_events" ON events;
CREATE POLICY "service_role_all_events" ON events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_events" ON events;
CREATE POLICY "authenticated_read_events" ON events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "events_manage_insert" ON events;
CREATE POLICY "events_manage_insert" ON events
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "events_manage_update" ON events;
CREATE POLICY "events_manage_update" ON events
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "events_manage_delete" ON events;
CREATE POLICY "events_manage_delete" ON events
  FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('owner', 'manager'));


-- ==================================================================
-- 2. event_payments
-- ==================================================================
GRANT ALL ON event_payments TO service_role;
GRANT SELECT, INSERT, UPDATE ON event_payments TO authenticated;

DROP POLICY IF EXISTS "service_role_all_event_payments" ON event_payments;
CREATE POLICY "service_role_all_event_payments" ON event_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_event_payments" ON event_payments;
CREATE POLICY "authenticated_read_event_payments" ON event_payments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "event_payments_manage_insert" ON event_payments;
CREATE POLICY "event_payments_manage_insert" ON event_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "event_payments_manage_update" ON event_payments;
CREATE POLICY "event_payments_manage_update" ON event_payments
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));


-- ==================================================================
-- 3. table_bookings   (had ZERO policies — confirmed against live DB)
-- ==================================================================
GRANT ALL ON table_bookings TO service_role;
GRANT SELECT, INSERT, UPDATE ON table_bookings TO authenticated;

DROP POLICY IF EXISTS "service_role_all_table_bookings" ON table_bookings;
CREATE POLICY "service_role_all_table_bookings" ON table_bookings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_table_bookings" ON table_bookings;
CREATE POLICY "authenticated_read_table_bookings" ON table_bookings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "table_bookings_manage_insert" ON table_bookings;
CREATE POLICY "table_bookings_manage_insert" ON table_bookings
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager', 'restaurant_manager'));

DROP POLICY IF EXISTS "table_bookings_manage_update" ON table_bookings;
CREATE POLICY "table_bookings_manage_update" ON table_bookings
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager', 'restaurant_manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager', 'restaurant_manager'));


-- ==================================================================
-- 4. user_profiles
-- ==================================================================
GRANT ALL ON user_profiles TO service_role;
GRANT SELECT, UPDATE ON user_profiles TO authenticated;

DROP POLICY IF EXISTS "service_role_all_user_profiles" ON user_profiles;
CREATE POLICY "service_role_all_user_profiles" ON user_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_user_profiles" ON user_profiles;
CREATE POLICY "authenticated_read_user_profiles" ON user_profiles
  FOR SELECT TO authenticated USING (true);

-- Owner-only. Uses the SECURITY DEFINER helper, so this policy reading
-- user_profiles does not recurse into user_profiles' own RLS.
DROP POLICY IF EXISTS "user_profiles_owner_update" ON user_profiles;
CREATE POLICY "user_profiles_owner_update" ON user_profiles
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() = 'owner')
  WITH CHECK (public.current_app_role() = 'owner');


-- ==================================================================
-- 5. staff
-- ==================================================================
GRANT ALL ON staff TO service_role;
GRANT SELECT, INSERT, UPDATE ON staff TO authenticated;

DROP POLICY IF EXISTS "service_role_all_staff" ON staff;
CREATE POLICY "service_role_all_staff" ON staff
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_staff" ON staff;
CREATE POLICY "authenticated_read_staff" ON staff
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "staff_owner_insert" ON staff;
CREATE POLICY "staff_owner_insert" ON staff
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() = 'owner');

DROP POLICY IF EXISTS "staff_owner_update" ON staff;
CREATE POLICY "staff_owner_update" ON staff
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() = 'owner')
  WITH CHECK (public.current_app_role() = 'owner');


-- ==================================================================
-- 6. staff — remove the stale 004 blanket policy
-- ==================================================================
-- 004_attendance_columns.sql:14-16 created
--   "authenticated can access staff" ON staff FOR ALL TO authenticated
--   USING (true) WITH CHECK (true)
-- and 016_staff_restructure.sql dropped only its own two policy names, never
-- this one. Confirmed still live on 2026-07-26. Until this DROP runs, any
-- authenticated user of any role can rewrite the entire 62-row real roster.
--
-- 012_attendance_rls.sql:6 already dropped the equivalent blanket policy on
-- attendance_records. This is the matching drop that was missed.
--
-- Nothing in src/ depends on it: StaffTab.jsx writes staff through the
-- service_role client, and read access is preserved by
-- "authenticated_read_staff" above.

DROP POLICY IF EXISTS "authenticated can access staff" ON staff;


-- ==================================================================
-- 7. event_checklists   (exists in live DB; CREATE TABLE is Sprint D)
-- ==================================================================
-- authenticated held NO table-level grant here (only REFERENCES/TRIGGER/
-- TRUNCATE), so the existing SELECT policy was unreachable. Granting.
GRANT ALL ON event_checklists TO service_role;
GRANT SELECT, INSERT, UPDATE ON event_checklists TO authenticated;

DROP POLICY IF EXISTS "service_role_all_event_checklists" ON event_checklists;
CREATE POLICY "service_role_all_event_checklists" ON event_checklists
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_event_checklists" ON event_checklists;
CREATE POLICY "authenticated_read_event_checklists" ON event_checklists
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "event_checklists_manage_insert" ON event_checklists;
CREATE POLICY "event_checklists_manage_insert" ON event_checklists
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "event_checklists_manage_update" ON event_checklists;
CREATE POLICY "event_checklists_manage_update" ON event_checklists
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));


-- ==================================================================
-- 8. shift_settings   (exists in live DB; CREATE TABLE is Sprint D)
-- ==================================================================
GRANT ALL ON shift_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON shift_settings TO authenticated;

DROP POLICY IF EXISTS "service_role_all_shift_settings" ON shift_settings;
CREATE POLICY "service_role_all_shift_settings" ON shift_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_shift_settings" ON shift_settings;
CREATE POLICY "authenticated_read_shift_settings" ON shift_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "shift_settings_manage_insert" ON shift_settings;
CREATE POLICY "shift_settings_manage_insert" ON shift_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "shift_settings_manage_update" ON shift_settings;
CREATE POLICY "shift_settings_manage_update" ON shift_settings
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "shift_settings_manage_delete" ON shift_settings;
CREATE POLICY "shift_settings_manage_delete" ON shift_settings
  FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('owner', 'manager'));


-- ==================================================================
-- 9. tables   (exists in live DB; CREATE TABLE is Sprint D)
-- ==================================================================
-- Read-only from the UI. No write policy is written because no code path
-- writes this table. The roster is maintained directly in Supabase today.
GRANT ALL ON tables TO service_role;
GRANT SELECT ON tables TO authenticated;

DROP POLICY IF EXISTS "service_role_all_tables" ON tables;
CREATE POLICY "service_role_all_tables" ON tables
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_tables" ON tables;
CREATE POLICY "authenticated_read_tables" ON tables
  FOR SELECT TO authenticated USING (true);


-- ==================================================================
-- 10. fm_market_days — NOT CREATED HERE
-- ==================================================================
-- Confirmed absent from the live database (pg_class, all relkinds, 2026-07-26).
-- MarketDayTab.jsx:44/:199/:205 reads and writes it, so the Farmers Market
-- "market day notes" surface is broken in production right now.
-- CREATE TABLE + RLS + policies belong to Sprint D per the sprint brief.
-- Logged in WOODLANDS_FOLLOWUPS.md.
