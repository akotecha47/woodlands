-- 008_inventory.sql
-- Merged 9 August 2026 during migration history reconciliation: this version
-- number previously existed as two separate files (008_inventory.sql,
-- 008_event_bill_items.sql). schema_migrations has PRIMARY KEY (version), so
-- both could never be recorded by `migration repair` — merged into one file,
-- one version. See WOODLANDS_FOLLOWUPS.md — POST-MEETING PRIORITY 1.

-- ==================================================================
-- SECTION 1 — Inventory (current_stock, stock_movements, requisitions)
-- ==================================================================
-- NOTE: If a 'requisitions' table already exists from 001_schema.sql (referencing
-- inventory_items), drop it first: DROP TABLE IF EXISTS requisitions CASCADE;
-- The new schema references stock_items instead.
-- (Historical note: that DROP was never run by hand, so this CREATE TABLE IF
-- NOT EXISTS silently no-opped and live kept the incompatible 001_schema.sql
-- version until 028_requisitions_reconcile.sql dropped and recreated it
-- correctly. Left in place for the historical record — do not "fix" by
-- adding the DROP here; 028 already did the real recreation live.)

CREATE TABLE IF NOT EXISTS current_stock (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id  uuid NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  quantity       numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  last_updated   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(stock_item_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id   uuid NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  movement_type   text NOT NULL CHECK (movement_type IN ('delivery','transfer','adjustment','requisition')),
  quantity_change numeric NOT NULL,
  from_department text,
  to_department   text,
  performed_by    uuid REFERENCES auth.users(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS requisitions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id  uuid NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  requested_by   uuid REFERENCES auth.users(id),
  department     text,
  quantity       numeric NOT NULL,
  reason         text,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','fulfilled','rejected')),
  reviewed_by    uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE current_stock   ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read current_stock"         ON current_stock;
DROP POLICY IF EXISTS "service role full access current_stock"   ON current_stock;
DROP POLICY IF EXISTS "authenticated read stock_movements"       ON stock_movements;
DROP POLICY IF EXISTS "service role full access stock_movements" ON stock_movements;
DROP POLICY IF EXISTS "authenticated read requisitions"          ON requisitions;
DROP POLICY IF EXISTS "service role full access requisitions"    ON requisitions;

CREATE POLICY "authenticated read current_stock"         ON current_stock   FOR SELECT TO authenticated USING (true);
CREATE POLICY "service role full access current_stock"   ON current_stock   FOR ALL    TO service_role  USING (true) WITH CHECK (true);
CREATE POLICY "authenticated read stock_movements"       ON stock_movements  FOR SELECT TO authenticated USING (true);
CREATE POLICY "service role full access stock_movements" ON stock_movements  FOR ALL    TO service_role  USING (true) WITH CHECK (true);
CREATE POLICY "authenticated read requisitions"          ON requisitions     FOR SELECT TO authenticated USING (true);
CREATE POLICY "service role full access requisitions"    ON requisitions     FOR ALL    TO service_role  USING (true) WITH CHECK (true);

GRANT ALL ON current_stock  TO service_role;
GRANT ALL ON stock_movements TO service_role;
GRANT ALL ON requisitions    TO service_role;

-- ==================================================================
-- SECTION 2 — Event bill items (merged from former 008_event_bill_items.sql)
-- ==================================================================

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

DROP POLICY IF EXISTS "authenticated read event_bill_items" ON event_bill_items;
CREATE POLICY "authenticated read event_bill_items" ON event_bill_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service role full access event_bill_items" ON event_bill_items;
CREATE POLICY "service role full access event_bill_items" ON event_bill_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON event_bill_items TO service_role;
