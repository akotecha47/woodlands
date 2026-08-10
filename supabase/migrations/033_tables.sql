-- 033_tables.sql
-- CREATE for a table that has existed live since before migration-history
-- tracking began. 021_sprint_a_policies.sql granted/policied it under the
-- note "exists in live DB; CREATE TABLE is Sprint D" — this is that
-- migration. IF NOT EXISTS throughout: 12 live rows, do not DROP.
-- DDL captured from live pg_catalog during the 9 August 2026 diagnosis.
-- Note: this is restaurant seating for Table Bookings, unrelated to
-- table_bookings itself.
--
-- ORDERING CAVEAT (flagged, not fixed here): same issue as
-- 031_event_checklists.sql — 021_sprint_a_policies.sql GRANTs/policies
-- tables before this file creates it on a from-files rebuild.

CREATE TABLE IF NOT EXISTS tables (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number text NOT NULL,
  capacity     integer NOT NULL,
  location     text NOT NULL CHECK (location IN ('Indoor', 'Outdoor', 'Terrace', 'Private Room')),
  is_active    boolean DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_number)
);

ALTER TABLE tables ENABLE ROW LEVEL SECURITY;

GRANT ALL ON tables TO service_role;
GRANT SELECT ON tables TO authenticated;

-- Canonical policy names only (matching 021_sprint_a_policies.sql). The
-- pre-existing legacy-named duplicates ("authenticated read tables",
-- "service role full access tables") are not reproduced here — their
-- removal from live is a separate cleanup, noted not scripted.
DROP POLICY IF EXISTS "service_role_all_tables" ON tables;
CREATE POLICY "service_role_all_tables" ON tables
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_tables" ON tables;
CREATE POLICY "authenticated_read_tables" ON tables
  FOR SELECT TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policy for authenticated: read-only from the UI,
-- roster maintained directly in Supabase today (matches
-- 021_sprint_a_policies.sql's stated intent).
