CREATE TABLE IF NOT EXISTS event_stock_allocations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  stock_item_id   uuid NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
  allocated_qty   numeric NOT NULL CHECK (allocated_qty > 0),
  consumed_qty    numeric,
  status          text NOT NULL DEFAULT 'pending',
  deducted_at     timestamptz,
  cleared_at      timestamptz,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, stock_item_id)
);

ALTER TABLE event_stock_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_event_stock_allocations"
  ON event_stock_allocations FOR ALL TO service_role
  USING (true) WITH CHECK (true);
GRANT ALL ON event_stock_allocations TO service_role;
