-- ─────────────────────────────────────────────────────────────────────────────
-- Woodlands Attendance — HISTORICAL. Written as a "paste into the SQL
-- editor" script, not a numbered migration. Everything below is already
-- applied live.
--
-- 9 August 2026 migration-history reconciliation removed the parts of this
-- file that broke a from-files rebuild (`supabase db reset` runs seed.sql
-- after migrations):
--   - the bar_week_config RLS/policy block — that table was dropped by
--     018_drop_dead_tables.sql, so ENABLE ROW LEVEL SECURITY on it here
--     would fail against a fresh rebuild.
--   - the shift_settings RLS/policy block — shift_settings is now created,
--     with RLS and canonical policies, by 032_shift_settings.sql. This
--     file's copy used different (legacy) policy names and is now
--     redundant.
--   - the four clock_in_lat/lng, clock_out_lat/lng column adds — now owned
--     by 035_attendance_gps_columns.sql.
-- See WOODLANDS_FOLLOWUPS.md — POST-MEETING PRIORITY 1 for the full finding.
--
-- NOT removed: the attendance_records RLS/policy block below. Live carries
-- these exact policy names — not 017_attendance_staff_id.sql's canonical
-- "service_role_all_attendance", and not 012_attendance_rls.sql's scoped
-- policies (012 never applied live). Reconciling this is the 012 auth
-- session's job. Do not delete or edit it outside that session.
--
-- Also not removed (residual, harmless duplication, not a rebuild landmine):
-- the staff_id/date NOT NULL relaxation and the user_id/shift_date/
-- within_radius/break_start/break_end column adds duplicate
-- 010_attendance_user_id.sql; the user_profiles shift_name/bar_week adds
-- duplicate 011_user_shift_fields.sql. Both are idempotent no-ops by the
-- time this file runs and were out of scope for this pass.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Relax legacy NOT NULL constraints (scaffold columns)
ALTER TABLE attendance_records ALTER COLUMN staff_id DROP NOT NULL;
ALTER TABLE attendance_records ALTER COLUMN date     DROP NOT NULL;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS user_id        uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS shift_date     date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS within_radius  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS break_start    timestamptz,
  ADD COLUMN IF NOT EXISTS break_end      timestamptz;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS shift_name text,
  ADD COLUMN IF NOT EXISTS bar_week   text CHECK (bar_week IN ('A','B'));

-- 2. Mandatory RLS + service_role grants (standards rule 9)
-- ATTENDANCE RLS POLICY DDL — LEFT IN PLACE, FLAGGED FOR THE 012 SESSION.
-- Do not touch outside that session (see header note above).
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full access attendance_records" ON attendance_records;
CREATE POLICY "service role full access attendance_records"
  ON attendance_records FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated read attendance_records" ON attendance_records;
CREATE POLICY "authenticated read attendance_records"
  ON attendance_records FOR SELECT TO authenticated USING (true);
GRANT ALL ON attendance_records TO service_role;
