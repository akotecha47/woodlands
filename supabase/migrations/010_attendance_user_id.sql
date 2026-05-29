-- Migrate attendance_records from legacy staff_id/date to user_id/shift_date

-- Make staff_id nullable (was NOT NULL in original scaffold)
ALTER TABLE attendance_records
  ALTER COLUMN staff_id DROP NOT NULL;

-- Add user-profile-linked columns (idempotent)
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS user_id     uuid REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS shift_date  date,
  ADD COLUMN IF NOT EXISTS break_start timestamptz,
  ADD COLUMN IF NOT EXISTS break_end   timestamptz,
  ADD COLUMN IF NOT EXISTS within_radius boolean;

-- Unique constraint so each user has at most one record per day
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_user_shift_date_key
  ON attendance_records (user_id, shift_date)
  WHERE user_id IS NOT NULL;
