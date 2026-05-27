-- staff: shift times for late detection
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS shift_start time,
  ADD COLUMN IF NOT EXISTS shift_end   time;

-- attendance_records: lunch tracking, computed status, GPS flag
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS lunch_out    timestamptz,
  ADD COLUMN IF NOT EXISTS lunch_in     timestamptz,
  ADD COLUMN IF NOT EXISTS status       text,
  ADD COLUMN IF NOT EXISTS gps_verified boolean NOT NULL DEFAULT false;

-- RLS policies for attendance tables (other tables may need similar policies)
DROP POLICY IF EXISTS "authenticated can access staff" ON staff;
CREATE POLICY "authenticated can access staff"
  ON staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated can access attendance_records" ON attendance_records;
CREATE POLICY "authenticated can access attendance_records"
  ON attendance_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
