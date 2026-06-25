-- 019_event_staff.sql
-- Per-event staff assignment table.

CREATE TABLE IF NOT EXISTS event_staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES staff(id)  ON DELETE CASCADE,
  role_label  text NOT NULL,
  notes       text,
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, staff_id)
);

ALTER TABLE event_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_event_staff"
  ON event_staff FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON event_staff TO service_role;
