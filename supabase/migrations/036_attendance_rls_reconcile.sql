-- 036_attendance_rls_reconcile.sql
-- SESSION B (012 auth) — the RLS half of the migration-reconciliation gate.
--
-- Supersedes, and is the single owner of, RLS on attendance_records. It
-- replaces three earlier and mutually inconsistent sources:
--
--   004_attendance_columns.sql:18-20  created the blanket
--       "authenticated can access attendance_records" (ALL / authenticated /
--       USING true / WITH CHECK true) — any authenticated user of any role
--       could read, rewrite or insert any staff attendance row.
--   012_attendance_rls.sql            was written to drop that blanket and
--       add scoped policies. It NEVER RAN against live. Its own-row policies
--       are absent under those names, and its assumption — "manager access
--       goes through supabaseAdmin (service role), so no manager policy is
--       needed" — was invalidated by Sprint B, which deleted the browser
--       service-role client. Managers now read and write attendance through
--       the anon client and DO need policies.
--   supabase/seed.sql                 created "service role full access
--       attendance_records" and a second blanket read,
--       "authenticated read attendance_records" (SELECT / authenticated /
--       USING true). That block is removed from seed.sql in the same commit
--       as this file.
--
-- Three further policies existed live under names that appear in no file at
-- all — "staff can read/insert/update own attendance". Their intent is kept;
-- they are recreated here under canonical names and then dropped by their
-- legacy names.
--
-- Idempotent throughout: DROP POLICY IF EXISTS precedes every CREATE POLICY,
-- and the removals at the foot are IF EXISTS.
--
-- ------------------------------------------------------------------
-- LIVE BASELINE (queried 10 August 2026 on a fresh connection, before writing)
-- ------------------------------------------------------------------
--   RLS enabled: yes (relrowsecurity = t, relforcerowsecurity = f)
--   Grants to authenticated: SELECT, INSERT, UPDATE. No DELETE. No anon DML.
--   Rows: 15 — ALL of them staff_id-populated with user_id NULL. Zero rows
--         carry a user_id. Every live row is a manager-written roster row,
--         so an own-row-only policy set would leave 100% of live data
--         unreadable and unwritable by the application.
--   public.current_app_role() present, SECURITY DEFINER, as per 021.
--   user_profiles roles live: owner, manager, kitchen_manager,
--         restaurant_manager — one user each. No role outside roles.js.
--
-- ------------------------------------------------------------------
-- ACCESS MATRIX — derived from the current UI, not invented
-- ------------------------------------------------------------------
-- Route roles authoritative in src/lib/roles.js.
-- ROUTE_ACCESS['/attendance'] = ['owner', 'manager']. kitchen_manager and
-- restaurant_manager cannot reach the module at all, so they get no
-- attendance access beyond their own rows.
--
--   own row      SELECT  every authenticated user   ClockInOutTab.jsx:44,:87
--                INSERT  every authenticated user   ClockInOutTab.jsx:128 (clock in)
--                UPDATE  every authenticated user   ClockInOutTab.jsx:147,:160,:173
--                                                   (break start/end, clock out)
--   all rows     SELECT  owner, manager             TodayTab.jsx:47,:51,
--                                                   HistoryTab.jsx:66,
--                                                   OwnerDashboard.jsx:109,:131
--                INSERT  owner, manager             TodayTab.jsx:177 (Mark All Absent),
--                                                   :212 (Override), :240 (Note)
--                UPDATE  owner, manager             TodayTab.jsx:195 (Override),
--                                                   :233 (Note)
--
-- NO DELETE POLICY, deliberately. Nothing in src/ deletes an attendance
-- record, and `authenticated` holds no DELETE grant on this table, so DELETE
-- is fail-closed at the grant layer before RLS is consulted. Recorded
-- explicitly here so a later audit reads this as a decision rather than the
-- unplanned asymmetry found on stock_items (WOODLANDS_FOLLOWUPS.md).
--
-- OwnerDashboard.jsx:107 issues its attendance query inside an unconditional
-- Promise.all for all four roles, gating only the display. After this file,
-- kitchen_manager and restaurant_manager get zero rows back rather than every
-- row. Nothing renders it for them, so there is no visible change — the query
-- simply stops returning data those roles were never shown. Same shape as the
-- Farmers Market at-risk query already logged in WOODLANDS_FOLLOWUPS.md.

-- ==================================================================
-- 0. GRANTS  (re-asserted; already live, no change)
-- ==================================================================
GRANT ALL ON attendance_records TO service_role;
GRANT SELECT, INSERT, UPDATE ON attendance_records TO authenticated;

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;


-- ==================================================================
-- 1. service_role — canonical name
-- ==================================================================
-- 017_attendance_staff_id.sql declared this name; it never reached live,
-- where the legacy "service role full access attendance_records" from
-- seed.sql stands in its place. Created here first so the table is never
-- without service_role coverage; the legacy name is dropped in section 4.

DROP POLICY IF EXISTS "service_role_all_attendance" ON attendance_records;
CREATE POLICY "service_role_all_attendance" ON attendance_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ==================================================================
-- 2. own-row access — every authenticated user
-- ==================================================================
-- Canonical names for the three unfiled "staff can … own attendance"
-- policies. Same predicate, same effect. The legacy names are dropped in
-- section 4.
--
-- The live UPDATE policy carried USING but no WITH CHECK. Postgres reuses
-- USING as the check in that case, so the behaviour is unchanged — it is
-- written explicitly here so the file states what it means.

DROP POLICY IF EXISTS "attendance_own_select" ON attendance_records;
CREATE POLICY "attendance_own_select" ON attendance_records
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "attendance_own_insert" ON attendance_records;
CREATE POLICY "attendance_own_insert" ON attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "attendance_own_update" ON attendance_records;
CREATE POLICY "attendance_own_update" ON attendance_records
  FOR UPDATE TO authenticated
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ==================================================================
-- 3. manager access — owner, manager
-- ==================================================================
-- All three commands, not read alone. The manager attendance surface writes:
-- Mark All Absent inserts one row per unclocked staff member, and Override
-- and Note insert-or-update. Every one of those rows has user_id NULL and
-- staff_id set, so section 2's predicate does not reach them. Read-only
-- manager policies would leave those three buttons failing with a
-- permission-denied that RLS reports as an empty result.

DROP POLICY IF EXISTS "attendance_manage_select" ON attendance_records;
CREATE POLICY "attendance_manage_select" ON attendance_records
  FOR SELECT TO authenticated
  USING (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "attendance_manage_insert" ON attendance_records;
CREATE POLICY "attendance_manage_insert" ON attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));

DROP POLICY IF EXISTS "attendance_manage_update" ON attendance_records;
CREATE POLICY "attendance_manage_update" ON attendance_records
  FOR UPDATE TO authenticated
  USING      (public.current_app_role() IN ('owner', 'manager'))
  WITH CHECK (public.current_app_role() IN ('owner', 'manager'));


-- ==================================================================
-- 4. REMOVALS — last, so coverage is never absent mid-file
-- ==================================================================
-- (a) The hole. ALL / authenticated / USING (true) WITH CHECK (true) on a
--     table of real staff attendance. Removed, not renamed.
DROP POLICY IF EXISTS "authenticated can access attendance_records" ON attendance_records;

-- (b) The second blanket read, from seed.sql. SELECT / authenticated /
--     USING (true). Dropping (a) alone would have left every authenticated
--     user still able to read every attendance row through this one.
DROP POLICY IF EXISTS "authenticated read attendance_records" ON attendance_records;

-- (c) Legacy service_role name, fully replaced by section 1.
DROP POLICY IF EXISTS "service role full access attendance_records" ON attendance_records;

-- (d) The three unfiled own-row policies, replaced by section 2.
DROP POLICY IF EXISTS "staff can read own attendance"   ON attendance_records;
DROP POLICY IF EXISTS "staff can insert own attendance" ON attendance_records;
DROP POLICY IF EXISTS "staff can update own attendance" ON attendance_records;

-- (e) 012_attendance_rls.sql's own two policy names. NO-OP AGAINST LIVE —
--     012 never ran, so these have never existed in production. They are
--     dropped here for the from-files rebuild path only, and they are not
--     optional there.
--
--     012 is about to be recorded as applied by `migration repair`, which
--     writes a version number without executing the file. Live is therefore
--     unaffected. But a rebuild into an empty database runs every migration
--     in order, so 012 WOULD execute and create these two policies, and
--     without these drops they would survive to the end of the run. The
--     rebuild would finish with nine policies on attendance_records where
--     production has seven, and the two extras would be exactly the
--     unscoped-by-role own-row policies 036 replaced with canonical names.
--     Standard §2.6's rebuild proof would fail on a table nobody had
--     touched — and it would look like drift rather than a known artefact.
DROP POLICY IF EXISTS "users can read own attendance_records"   ON attendance_records;
DROP POLICY IF EXISTS "users can insert own attendance_records" ON attendance_records;
