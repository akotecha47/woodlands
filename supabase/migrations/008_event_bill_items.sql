CREATE TABLE IF NOT EXISTS event_bill_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category    text NOT NULL,
  description text,
  amount      numeric NOT NULL,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_bill_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read event_bill_items" ON event_bill_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service role full access event_bill_items" ON event_bill_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON event_bill_items TO service_role;
