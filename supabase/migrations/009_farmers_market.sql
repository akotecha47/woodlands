-- Farmers Market full rebuild
-- Old tables (fm_holders, fm_visits, fm_payments) had different schemas.
-- Drop and recreate with the canonical spec below.
-- Run in Supabase SQL editor before deploying the frontend.

DROP TABLE IF EXISTS fm_payments CASCADE;
DROP TABLE IF EXISTS fm_visits   CASCADE;
DROP TABLE IF EXISTS fm_holders  CASCADE;

CREATE TABLE fm_holders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stall_number      text UNIQUE NOT NULL,
  full_name         text NOT NULL,
  business_name     text,
  stall_type        text NOT NULL CHECK (stall_type IN ('Produce','Crafts','Food & Beverages','Clothing','Other')),
  phone             text NOT NULL,
  email             text,
  status            text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','accepted','active','inactive','at_risk')),
  application_paid  bool DEFAULT false,
  acceptance_paid   bool DEFAULT false,
  last_contacted    timestamptz,
  notes             text,
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fm_visits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id       uuid NOT NULL REFERENCES fm_holders(id) ON DELETE CASCADE,
  visit_date      date NOT NULL,
  checked_in_by   uuid REFERENCES auth.users(id),
  fee_paid        bool DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(holder_id, visit_date)
);

CREATE TABLE fm_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id       uuid NOT NULL REFERENCES fm_holders(id) ON DELETE CASCADE,
  payment_type    text NOT NULL CHECK (payment_type IN ('application','acceptance','visit')),
  amount          numeric NOT NULL,
  payment_date    date NOT NULL,
  payment_method  text NOT NULL CHECK (payment_method IN ('cash','bank_transfer','tnm_mpamba','airtel_money')),
  reference       text,
  recorded_by     uuid REFERENCES auth.users(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fm_holders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fm_visits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fm_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read fm_holders"  ON fm_holders  FOR SELECT TO authenticated USING (true);
CREATE POLICY "service role full access fm_holders"  ON fm_holders  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read fm_visits"   ON fm_visits   FOR SELECT TO authenticated USING (true);
CREATE POLICY "service role full access fm_visits"   ON fm_visits   FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read fm_payments" ON fm_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "service role full access fm_payments" ON fm_payments FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON fm_holders  TO service_role;
GRANT ALL ON fm_visits   TO service_role;
GRANT ALL ON fm_payments TO service_role;
