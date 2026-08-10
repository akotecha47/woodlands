-- 032_shift_settings.sql
-- CREATE for a table that has existed live since before migration-history
-- tracking began. 021_sprint_a_policies.sql granted/policied it under the
-- note "exists in live DB; CREATE TABLE is Sprint D" — this is that
-- migration. IF NOT EXISTS throughout: 12 live rows, do not DROP.
-- DDL captured from live pg_catalog during the 9 August 2026 diagnosis.
-- See WOODLANDS_FOLLOWUPS.md — POST-MEETING PRIORITY 1.
--
-- ORDERING CAVEAT (flagged, not fixed here): same issue as
-- 031_event_checklists.sql — 021_sprint_a_policies.sql GRANTs/policies
-- shift_settings before this file creates it on a from-files rebuild.
--
-- supabase/seed.sql previously also carried a shift_settings RLS/policy
-- block under different (legacy) policy names — removed from seed.sql in
-- this same reconciliation pass because this migration now owns it.

CREATE TABLE IF NOT EXISTS shift_settings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department     text NOT NULL,
  shift_name     text NOT NULL,
  shift_start    time NOT NULL,
  shift_end      time NOT NULL,
  late_threshold integer NOT NULL DEFAULT 15,
  days_per_week  integer NOT NULL DEFAULT 6,
  shift_type     text NOT NULL DEFAULT 'standard' CHECK (shift_type IN ('standard', 'rotating')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department, shift_name)
);

ALTER TABLE shift_settings ENABLE ROW LEVEL SECURITY;

GRANT ALL ON shift_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON shift_settings TO authenticated;

-- Canonical policy names only (matching 021_sprint_a_policies.sql). The
-- pre-existing legacy-named duplicates (from seed.sql: "authenticated read
-- shift_settings", "service role full access shift_settings") are not
-- reproduced here — their removal from live is a separate cleanup, noted
-- not scripted.
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
