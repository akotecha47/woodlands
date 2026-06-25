-- 017_attendance_staff_id.sql
-- Add staff_id FK to attendance_records and lock down RLS for service_role.

-- ── 1. COLUMN + INDEX ────────────────────────────────────────────────────────
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_staff_id
  ON attendance_records(staff_id);

-- ── 2. RLS (idempotent) ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "service_role_all_attendance" ON attendance_records;
CREATE POLICY "service_role_all_attendance"
  ON attendance_records FOR ALL TO service_role
  USING (true) WITH CHECK (true);
GRANT ALL ON attendance_records TO service_role;
