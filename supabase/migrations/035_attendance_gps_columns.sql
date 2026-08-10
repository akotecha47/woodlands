-- 035_attendance_gps_columns.sql
-- Reconciliation: four GPS columns exist live on attendance_records but were
-- declared only in supabase/seed.sql, not in any numbered migration. Read by
-- ClockInOutTab.jsx, HistoryTab.jsx and TodayTab.jsx. Migrated here so
-- supabase/seed.sql can drop this DDL as part of the same reconciliation
-- pass (see the seed.sql cleanup note in WOODLANDS_FOLLOWUPS.md — POST-MEETING
-- PRIORITY 1).
--
-- Written idempotently (IF NOT EXISTS).

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS clock_in_lat  numeric,
  ADD COLUMN IF NOT EXISTS clock_in_lng  numeric,
  ADD COLUMN IF NOT EXISTS clock_out_lat numeric,
  ADD COLUMN IF NOT EXISTS clock_out_lng numeric;
