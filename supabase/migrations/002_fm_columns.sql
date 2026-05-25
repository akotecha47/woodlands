-- fm_holders: track payment status and join date
ALTER TABLE fm_holders
  ADD COLUMN IF NOT EXISTS application_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acceptance_paid  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS joined_date      date;

-- fm_visits: track visit fee payment as a boolean on the visit record
ALTER TABLE fm_visits
  ADD COLUMN IF NOT EXISTS fee_paid boolean NOT NULL DEFAULT false;

-- fm_payments: store payment method and recorder name as plain text
ALTER TABLE fm_payments
  ADD COLUMN IF NOT EXISTS method           text,
  ADD COLUMN IF NOT EXISTS recorded_by_name text;
