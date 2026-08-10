-- 031_event_checklists.sql
-- CREATE for a table that has existed live since before migration-history
-- tracking began. 021_sprint_a_policies.sql granted/policied it under the
-- note "exists in live DB; CREATE TABLE is Sprint D" — this is that
-- migration. IF NOT EXISTS throughout: 22 live rows, do not DROP.
-- DDL captured from live pg_catalog during the 9 August 2026 diagnosis.
-- See WOODLANDS_FOLLOWUPS.md — POST-MEETING PRIORITY 1.
--
-- ORDERING CAVEAT (flagged, not fixed here): 021_sprint_a_policies.sql
-- GRANTs and CREATE POLICYs against event_checklists assuming the table
-- already exists. On a from-files rebuild of an empty database, 021 runs
-- BEFORE this file (021 < 031) and will fail with "relation
-- event_checklists does not exist". This migration cannot fix that by
-- itself — see the repair-plan note about moving those statements out of
-- 021, or accepting the rebuild only works from a database that already has
-- these tables.

CREATE TABLE IF NOT EXISTS event_checklists (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  department    text NOT NULL,
  task          text NOT NULL,
  assigned_to   uuid REFERENCES auth.users(id),
  is_complete   boolean DEFAULT false,
  completed_by  uuid REFERENCES auth.users(id),
  completed_at  timestamptz,
  due_time      time,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_checklists ENABLE ROW LEVEL SECURITY;

GRANT ALL ON event_checklists TO service_role;
GRANT SELECT, INSERT, UPDATE ON event_checklists TO authenticated;

-- Canonical policy names only (matching 021_sprint_a_policies.sql). The
-- pre-existing legacy-named duplicates ("authenticated read
-- event_checklists", "service role full access event_checklists") are not
-- reproduced here — their removal from live is a separate cleanup, noted
-- not scripted.
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
