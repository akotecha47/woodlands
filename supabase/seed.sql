-- ─────────────────────────────────────────────────────────────────────────────
-- Woodlands Attendance: migration + seed (run once in Supabase SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Schema changes (idempotent)
ALTER TABLE attendance_records
  ALTER COLUMN staff_id DROP NOT NULL;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS user_id        uuid REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS break_start    timestamptz,
  ADD COLUMN IF NOT EXISTS break_end      timestamptz,
  ADD COLUMN IF NOT EXISTS within_radius  boolean,
  ADD COLUMN IF NOT EXISTS clock_in_lat   double precision,
  ADD COLUMN IF NOT EXISTS clock_in_lng   double precision;

-- 2. Seed 7 days of attendance records
DO $$
DECLARE
  v_user      RECORD;
  v_offset    int;
  v_day       date;
  v_mod       int;
  v_status    text;
  v_clock_in  timestamptz;
  v_clock_out timestamptz;
  v_seeded    int := 0;
BEGIN
  -- Wipe the seed window cleanly
  DELETE FROM attendance_records
  WHERE shift_date >= current_date - 6
    AND shift_date <= current_date;

  FOR v_user IN
    SELECT id, full_name, department
    FROM user_profiles
    WHERE role NOT IN ('owner', 'manager')
    ORDER BY full_name
  LOOP
    FOR v_offset IN 0..6 LOOP
      v_day := current_date - v_offset;

      -- Distribute statuses: mostly present, one late, one absent per user/week
      -- Vary by user (ascii of first char of uuid) to avoid everyone being absent
      -- on the same day
      v_mod := (v_offset + ascii(substr(v_user.id::text, 1, 1))) % 7;

      IF v_mod = 5 THEN
        v_status    := 'absent';
        v_clock_in  := NULL;
        v_clock_out := NULL;
      ELSIF v_mod = 6 THEN
        v_status    := 'late';
        v_clock_in  := (v_day::text || ' 08:45:00+02')::timestamptz;
        v_clock_out := (v_day::text || ' 17:30:00+02')::timestamptz;
      ELSE
        v_status    := 'present';
        v_clock_in  := (v_day::text || ' 08:00:00+02')::timestamptz;
        v_clock_out := (v_day::text || ' 17:00:00+02')::timestamptz;
      END IF;

      INSERT INTO attendance_records (user_id, shift_date, clock_in, clock_out, status)
      VALUES (v_user.id, v_day, v_clock_in, v_clock_out, v_status);

      v_seeded := v_seeded + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Seeded % attendance records for 7 days.', v_seeded;
END $$;
