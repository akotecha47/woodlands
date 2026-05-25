-- ============================================================
-- Woodlands Lodge Management System — Initial Schema
-- ============================================================

-- user_profiles
CREATE TABLE user_profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     text,
  email         text,
  role          text NOT NULL,
  department    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- inventory_items
CREATE TABLE inventory_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  category        text,
  department      text,
  unit            text NOT NULL,
  current_stock   numeric NOT NULL DEFAULT 0,
  reorder_level   numeric NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- deliveries
CREATE TABLE deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid NOT NULL REFERENCES inventory_items(id),
  quantity        numeric NOT NULL,
  unit_cost       numeric,
  supplier        text,
  delivered_by    text,
  received_by     uuid REFERENCES user_profiles(id),
  delivery_date   timestamptz NOT NULL DEFAULT now(),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- requisitions
CREATE TABLE requisitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id           uuid NOT NULL REFERENCES inventory_items(id),
  quantity          numeric NOT NULL,
  requested_by      uuid NOT NULL REFERENCES user_profiles(id),
  department        text NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  approved_by       uuid REFERENCES user_profiles(id),
  approved_at       timestamptz,
  rejection_reason  text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- stock_transfers
CREATE TABLE stock_transfers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          uuid NOT NULL REFERENCES inventory_items(id),
  quantity         numeric NOT NULL,
  from_department  text NOT NULL,
  to_department    text NOT NULL,
  transferred_by   uuid REFERENCES user_profiles(id),
  approved_by      uuid REFERENCES user_profiles(id),
  status           text NOT NULL DEFAULT 'pending',
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- stock_adjustments
CREATE TABLE stock_adjustments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          uuid NOT NULL REFERENCES inventory_items(id),
  adjustment_type  text NOT NULL,
  quantity         numeric NOT NULL,
  reason           text,
  adjusted_by      uuid NOT NULL REFERENCES user_profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- staff
CREATE TABLE staff (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        text NOT NULL,
  role             text,
  department       text,
  phone            text,
  email            text,
  hire_date        date,
  is_active        boolean NOT NULL DEFAULT true,
  user_profile_id  uuid REFERENCES user_profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- attendance_records
CREATE TABLE attendance_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     uuid NOT NULL REFERENCES staff(id),
  date         date NOT NULL,
  clock_in     timestamptz,
  clock_out    timestamptz,
  notes        text,
  recorded_by  uuid REFERENCES user_profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- events
CREATE TABLE events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  description        text,
  event_date         timestamptz NOT NULL,
  end_date           timestamptz,
  venue              text,
  capacity           integer,
  status             text NOT NULL DEFAULT 'upcoming',
  organizer_name     text,
  organizer_contact  text,
  deposit_amount     numeric NOT NULL DEFAULT 0,
  total_amount       numeric NOT NULL DEFAULT 0,
  created_by         uuid REFERENCES user_profiles(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- event_payments
CREATE TABLE event_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES events(id),
  amount          numeric NOT NULL,
  payment_date    timestamptz NOT NULL DEFAULT now(),
  payment_method  text,
  notes           text,
  recorded_by     uuid REFERENCES user_profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- event_tasks
CREATE TABLE event_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES events(id),
  title        text NOT NULL,
  description  text,
  assigned_to  uuid REFERENCES user_profiles(id),
  status       text NOT NULL DEFAULT 'pending',
  due_date     timestamptz,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- table_bookings
CREATE TABLE table_bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name    text NOT NULL,
  customer_phone   text,
  customer_email   text,
  booking_date     timestamptz NOT NULL,
  party_size       integer NOT NULL,
  table_number     text,
  status           text NOT NULL DEFAULT 'pending',
  special_requests text,
  deposit_paid     numeric NOT NULL DEFAULT 0,
  created_by       uuid REFERENCES user_profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- fm_holders
CREATE TABLE fm_holders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        text NOT NULL,
  business_name    text,
  phone            text,
  email            text,
  stall_number     text,
  product_category text,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- fm_visits
CREATE TABLE fm_visits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id      uuid NOT NULL REFERENCES fm_holders(id),
  visit_date     date NOT NULL,
  checked_in_at  timestamptz,
  checked_out_at timestamptz,
  notes          text,
  recorded_by    uuid REFERENCES user_profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- fm_payments
CREATE TABLE fm_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id      uuid NOT NULL REFERENCES fm_holders(id),
  amount         numeric NOT NULL,
  payment_date   timestamptz NOT NULL DEFAULT now(),
  payment_type   text,
  period_start   date,
  period_end     date,
  notes          text,
  recorded_by    uuid REFERENCES user_profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE user_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff              ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_bookings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fm_holders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fm_visits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fm_payments        ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Grants
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON user_profiles      TO authenticated;
GRANT SELECT, INSERT, UPDATE ON inventory_items    TO authenticated;
GRANT SELECT, INSERT, UPDATE ON deliveries         TO authenticated;
GRANT SELECT, INSERT, UPDATE ON requisitions       TO authenticated;
GRANT SELECT, INSERT, UPDATE ON stock_transfers    TO authenticated;
GRANT SELECT, INSERT, UPDATE ON stock_adjustments  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON staff              TO authenticated;
GRANT SELECT, INSERT, UPDATE ON attendance_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON events             TO authenticated;
GRANT SELECT, INSERT, UPDATE ON event_payments     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON event_tasks        TO authenticated;
GRANT SELECT, INSERT, UPDATE ON table_bookings     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON fm_holders         TO authenticated;
GRANT SELECT, INSERT, UPDATE ON fm_visits          TO authenticated;
GRANT SELECT, INSERT, UPDATE ON fm_payments        TO authenticated;
