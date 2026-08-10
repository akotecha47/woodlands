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
-- ------------------------------------------------------------------
-- DEFAULTS CORRECTED TO MATCH LIVE — 10 August 2026, Session B (012 auth)
-- ------------------------------------------------------------------
-- The two divergences Session A flagged are resolved here, document-to-live:
-- `shift_date` and `within_radius` below previously declared no DEFAULT,
-- while live carries `DEFAULT CURRENT_DATE` and `DEFAULT false` respectively
-- (re-verified against information_schema.columns on 10 August 2026). Both
-- came from supabase/seed.sql, which is what actually ran.
--
-- Documented to live rather than altered live: these are real defaults on a
-- table holding real attendance, nothing depends on their absence, and
-- issuing DROP DEFAULT against production to make it match a file that never
-- ran would be changing the system to fit the paperwork. seed.sql's copy of
-- these column adds is removed in the same commit, so this file is now their
-- only source and a from-files rebuild reproduces live exactly.
--
-- NOT relaxed here, and correctly so: `date` remains NOT NULL. seed.sql
-- carried an `ALTER COLUMN date DROP NOT NULL` that never took effect — live
-- is still NOT NULL, per 001_schema.sql:104 — and that statement is removed
-- from seed.sql rather than adopted here.
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
  ADD COLUMN IF NOT EXISTS shift_date  date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS break_start timestamptz,
  ADD COLUMN IF NOT EXISTS break_end   timestamptz,
  ADD COLUMN IF NOT EXISTS within_radius boolean DEFAULT false;

-- Unique constraint so each user has at most one record per day
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_user_shift_date_key
  ON attendance_records (user_id, shift_date)
  WHERE user_id IS NOT NULL;
