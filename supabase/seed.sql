-- ─────────────────────────────────────────────────────────────────────────────
-- Woodlands Attendance — schema migration + grants
-- Paste this entire block into the Supabase SQL Editor and run once.
-- All statements are idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Relax legacy NOT NULL constraints (scaffold columns)
ALTER TABLE attendance_records ALTER COLUMN staff_id DROP NOT NULL;
ALTER TABLE attendance_records ALTER COLUMN date     DROP NOT NULL;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS user_id        uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS shift_date     date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS within_radius  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS break_start    timestamptz,
  ADD COLUMN IF NOT EXISTS break_end      timestamptz,
  ADD COLUMN IF NOT EXISTS clock_in_lat   numeric,
  ADD COLUMN IF NOT EXISTS clock_in_lng   numeric,
  ADD COLUMN IF NOT EXISTS clock_out_lat  numeric,
  ADD COLUMN IF NOT EXISTS clock_out_lng  numeric;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS shift_name text,
  ADD COLUMN IF NOT EXISTS bar_week   text CHECK (bar_week IN ('A','B'));

-- 2. Mandatory RLS + service_role grants (standards rule 9)
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full access attendance_records" ON attendance_records;
CREATE POLICY "service role full access attendance_records"
  ON attendance_records FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated read attendance_records" ON attendance_records;
CREATE POLICY "authenticated read attendance_records"
  ON attendance_records FOR SELECT TO authenticated USING (true);
GRANT ALL ON attendance_records TO service_role;

ALTER TABLE shift_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full access shift_settings" ON shift_settings;
CREATE POLICY "service role full access shift_settings"
  ON shift_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated read shift_settings" ON shift_settings;
CREATE POLICY "authenticated read shift_settings"
  ON shift_settings FOR SELECT TO authenticated USING (true);
GRANT ALL ON shift_settings TO service_role;

ALTER TABLE bar_week_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full access bar_week_config" ON bar_week_config;
CREATE POLICY "service role full access bar_week_config"
  ON bar_week_config FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated read bar_week_config" ON bar_week_config;
CREATE POLICY "authenticated read bar_week_config"
  ON bar_week_config FOR SELECT TO authenticated USING (true);
GRANT ALL ON bar_week_config TO service_role;
