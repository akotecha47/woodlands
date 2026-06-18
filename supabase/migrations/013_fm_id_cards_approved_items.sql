-- Farmers Market: ID cards table, approved items table, and expanded payment_type CHECK

-- ── 1. Expand fm_payments payment_type CHECK constraint ────────────────────────
-- The constraint was created inline so Postgres names it fm_payments_payment_type_check.
-- Verify with: SELECT constraint_name FROM information_schema.table_constraints
--              WHERE table_name = 'fm_payments' AND constraint_type = 'CHECK';

ALTER TABLE fm_payments DROP CONSTRAINT IF EXISTS fm_payments_payment_type_check;
ALTER TABLE fm_payments ADD CONSTRAINT fm_payments_payment_type_check
  CHECK (payment_type IN ('application', 'acceptance', 'visit', 'id_card', 'reprint'));

-- ── 2. fm_id_cards ─────────────────────────────────────────────────────────────

CREATE TABLE fm_id_cards (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id   uuid        NOT NULL REFERENCES fm_holders(id) ON DELETE CASCADE,
  card_number int         NOT NULL,
  card_fee    numeric     NOT NULL,
  status      text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'reprinted', 'cancelled')),
  issued_by   uuid        REFERENCES auth.users(id),
  issued_at   timestamptz NOT NULL DEFAULT now(),
  notes       text
);

ALTER TABLE fm_id_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read fm_id_cards" ON fm_id_cards
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service role full access fm_id_cards" ON fm_id_cards
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON fm_id_cards TO service_role;

-- ── 3. fm_approved_items ───────────────────────────────────────────────────────

CREATE TABLE fm_approved_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id  uuid        NOT NULL REFERENCES fm_holders(id) ON DELETE CASCADE,
  item_name  text        NOT NULL,
  added_by   uuid        REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fm_approved_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read fm_approved_items" ON fm_approved_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service role full access fm_approved_items" ON fm_approved_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON fm_approved_items TO service_role;
