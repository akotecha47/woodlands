-- Migrate attendance_records from legacy staff_id/date to user_id/shift_date
--
-- ------------------------------------------------------------------
-- FK CORRECTED TO MATCH LIVE — 9 August 2026, migration reconciliation
-- ------------------------------------------------------------------
-- user_id below previously read `REFERENCES user_profiles(id)`. Live is
-- `REFERENCES auth.users(id)`, because this file never actually ran against
-- the live database — supabase/seed.sql did, and seed.sql declared
-- auth.users(id). The file text was corrected to describe reality rather
-- than issuing an ALTER against a live FK on a table holding real
-- attendance data. auth.users(id) is also the consistent choice: it is what
-- event_checklists.assigned_to/completed_by and attendance_records.user_id
-- already point at, and user_profiles.id satisfies it by construction.
--
-- STILL DIVERGENT, NOT CHANGED HERE (out of scope this session, flagged for
-- Session B's rebuild proof): live carries defaults this file does not —
-- `shift_date date DEFAULT CURRENT_DATE` and `within_radius boolean DEFAULT
-- false`, both applied by seed.sql. A from-files rebuild would produce these
-- two columns without defaults. Decide and reconcile before the §2.6 proof.
--
-- The CREATE UNIQUE INDEX at the foot of this file also never ran live; it
-- is now additionally created by 034_attendance_missing_indexes.sql. Both
-- are IF NOT EXISTS, so the rebuild path (010 creates it, 034 no-ops) and
-- the live path (010 unrecorded, 034 creates it) converge on the same state.

-- Make staff_id nullable (was NOT NULL in original scaffold)
ALTER TABLE attendance_records
  ALTER COLUMN staff_id DROP NOT NULL;

-- Add user-profile-linked columns (idempotent)
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS user_id     uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS shift_date  date,
  ADD COLUMN IF NOT EXISTS break_start timestamptz,
  ADD COLUMN IF NOT EXISTS break_end   timestamptz,
  ADD COLUMN IF NOT EXISTS within_radius boolean;

-- Unique constraint so each user has at most one record per day
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_user_shift_date_key
  ON attendance_records (user_id, shift_date)
  WHERE user_id IS NOT NULL;
