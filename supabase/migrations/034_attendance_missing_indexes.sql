-- 034_attendance_missing_indexes.sql
-- Reconciliation: attendance_records carries two indexes described in file
-- history but never applied live.
--
--   010_attendance_user_id.sql declared attendance_records_user_shift_date_key
--   (a unique index preventing two records per user per day) — absent live.
--   Verified 9 August 2026: 0 duplicate (user_id, shift_date) pairs across
--   the 15 live rows, so this builds cleanly with no pre-existing conflict.
--
--   017_attendance_staff_id.sql declared idx_attendance_staff_id — absent
--   live.
--
-- Written idempotently (IF NOT EXISTS). Does not touch any policy or FK —
-- the 010 FK divergence (auth.users vs user_profiles) and the 012 RLS gap
-- are explicitly out of scope here. See WOODLANDS_FOLLOWUPS.md — POST-MEETING
-- PRIORITY 1.

CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_user_shift_date_key
  ON attendance_records (user_id, shift_date)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_staff_id
  ON attendance_records(staff_id);
