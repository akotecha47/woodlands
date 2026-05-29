-- ─── Attendance seed — 7 days of records ────────────────────────────────────
-- Run this against the live DB after migration 010 has been applied.
-- Generates attendance_records using user_id + shift_date for all staff
-- (roles excluding owner and manager).

DO $$
DECLARE
  v_user_id uuid;
  v_day     date;
  v_offset  int;
  v_mod     int;
  v_status  text;
  v_in_ts   timestamptz;
  v_out_ts  timestamptz;
BEGIN
  -- Clear existing seed window to keep this idempotent
  DELETE FROM attendance_records
  WHERE shift_date >= current_date - 6
    AND shift_date <= current_date
    AND user_id IS NOT NULL;

  FOR v_user_id IN
    SELECT id FROM user_profiles
    WHERE role NOT IN ('owner', 'manager')
    ORDER BY id
  LOOP
    FOR v_offset IN 0..6 LOOP
      v_day := current_date - v_offset;

      -- Spread statuses across the week; vary per user via first UUID hex char
      v_mod := (v_offset + ascii(substr(v_user_id::text, 1, 1))) % 7;

      IF v_mod = 5 THEN
        v_status := 'absent';
        v_in_ts  := NULL;
        v_out_ts := NULL;
      ELSIF v_mod = 6 THEN
        v_status := 'late';
        v_in_ts  := (v_day::text || ' 08:45:00')::timestamp AT TIME ZONE 'Africa/Blantyre';
        v_out_ts := (v_day::text || ' 17:30:00')::timestamp AT TIME ZONE 'Africa/Blantyre';
      ELSE
        v_status := 'present';
        v_in_ts  := (v_day::text || ' 08:00:00')::timestamp AT TIME ZONE 'Africa/Blantyre';
        v_out_ts := (v_day::text || ' 17:00:00')::timestamp AT TIME ZONE 'Africa/Blantyre';
      END IF;

      INSERT INTO attendance_records (user_id, shift_date, clock_in, clock_out, status)
      VALUES (v_user_id, v_day, v_in_ts, v_out_ts, v_status)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
