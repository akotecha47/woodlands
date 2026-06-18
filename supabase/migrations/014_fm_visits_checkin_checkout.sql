-- Add check-in and check-out timestamps to fm_visits.
-- The existing checked_in_by (uuid) column tracks WHO checked in a business
-- via the Market Day tab. checked_in_at / checked_out_at track WHEN the
-- business themselves scanned their QR card on the public /checkin page.
-- fm_visits already has RLS + service_role policy — no changes needed there.

ALTER TABLE fm_visits ADD COLUMN IF NOT EXISTS checked_in_at  timestamptz;
ALTER TABLE fm_visits ADD COLUMN IF NOT EXISTS checked_out_at timestamptz;
