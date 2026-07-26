-- Realistic starter seed, 26 July 2026.
-- Data only, deliberately NOT in supabase/migrations — migrations are replayed
-- to rebuild the schema and must not carry demo rows.
--
-- Every foreign key target was read from the live database first, not assumed:
--   staff_id     -> real rows from the 62-row staff roster, mixed departments
--   created_by   -> user_profiles (Owner 73d1c4cc…)
--   table_id     -> real tables rows, party_size checked against capacity
--
-- Column choices follow what the UI actually writes, which matters because both
-- events and table_bookings carry duplicate column pairs from earlier drift:
--   events         uses `name` and `organiser_*`, NOT `title` / `organizer_*`
--                  (CreateEventTab.jsx:55-64)
--   table_bookings uses `guest_*`, NOT `customer_*` (NewBookingTab.jsx:88-90)
--
-- Timestamps: event_date and booking_date are timestamptz but the UI filters
-- them with plain 'YYYY-MM-DD' strings, which PostgREST casts at UTC. They are
-- therefore stored at midnight UTC so .eq()/.gte() filters match — writing them
-- at +02 would make them invisible to the Today and Upcoming views.
-- clock_in / clock_out are written at +02 so they read as Malawi wall-clock.

BEGIN;

-- ============================================================
-- ATTENDANCE — 3 recent days, 5 staff across 3 departments
-- ============================================================
-- Both `date` and `shift_date` are populated. `date` is NOT NULL with no
-- default and `shift_date` defaults to CURRENT_DATE, which is exactly the
-- mismatch that broke the manager path (Bug 1). Seeding both keeps the
-- self-service and manager read paths consistent.
INSERT INTO public.attendance_records
  (staff_id, date, shift_date, clock_in, clock_out, lunch_out, lunch_in, status, gps_verified, within_radius, notes) VALUES
  -- Thu 23 July
  ('22b9e21e-b004-40c2-b539-4a0105b17b14', '2026-07-23', '2026-07-23', '2026-07-23 07:58:00+02', '2026-07-23 17:05:00+02', NULL, NULL, 'present', true,  true,  NULL),
  ('62a988dc-ee5e-45aa-a548-8ba2d3e5dd75', '2026-07-23', '2026-07-23', '2026-07-23 15:55:00+02', '2026-07-23 23:30:00+02', NULL, NULL, 'present', true,  true,  NULL),
  ('85bdef24-7c7c-4da7-a3dc-9587e2596e72', '2026-07-23', '2026-07-23', '2026-07-23 08:22:00+02', '2026-07-23 17:02:00+02', NULL, NULL, 'late',    true,  true,  'Traffic on Kenyatta Drive'),
  ('656455be-058d-4e14-822f-b86acf1d2075', '2026-07-23', '2026-07-23', '2026-07-23 07:50:00+02', '2026-07-23 16:58:00+02', '2026-07-23 12:30:00+02', '2026-07-23 13:15:00+02', 'present', true, true, NULL),
  ('c0ac0c35-4492-4463-a4cc-bc799ebd934f', '2026-07-23', '2026-07-23', '2026-07-23 16:05:00+02', '2026-07-23 23:40:00+02', NULL, NULL, 'present', false, false, 'Clocked in from staff gate'),
  -- Fri 24 July
  ('22b9e21e-b004-40c2-b539-4a0105b17b14', '2026-07-24', '2026-07-24', '2026-07-24 08:02:00+02', '2026-07-24 17:10:00+02', '2026-07-24 12:45:00+02', '2026-07-24 13:30:00+02', 'present', true, true, NULL),
  ('62a988dc-ee5e-45aa-a548-8ba2d3e5dd75', '2026-07-24', '2026-07-24', '2026-07-24 15:58:00+02', '2026-07-24 23:45:00+02', NULL, NULL, 'present', true,  true,  NULL),
  ('85bdef24-7c7c-4da7-a3dc-9587e2596e72', '2026-07-24', '2026-07-24', '2026-07-24 07:55:00+02', '2026-07-24 17:00:00+02', NULL, NULL, 'present', true,  true,  NULL),
  ('656455be-058d-4e14-822f-b86acf1d2075', '2026-07-24', '2026-07-24', NULL,                     NULL,                     NULL, NULL, 'absent',  false, false, 'Called in sick'),
  ('c0ac0c35-4492-4463-a4cc-bc799ebd934f', '2026-07-24', '2026-07-24', '2026-07-24 16:35:00+02', '2026-07-24 23:50:00+02', NULL, NULL, 'late',    true,  true,  NULL),
  -- Sat 25 July (market day)
  ('22b9e21e-b004-40c2-b539-4a0105b17b14', '2026-07-25', '2026-07-25', '2026-07-25 08:00:00+02', '2026-07-25 13:05:00+02', NULL, NULL, 'present', true,  true,  'Market day cover'),
  ('62a988dc-ee5e-45aa-a548-8ba2d3e5dd75', '2026-07-25', '2026-07-25', '2026-07-25 15:50:00+02', '2026-07-25 23:55:00+02', NULL, NULL, 'present', true,  true,  NULL),
  ('85bdef24-7c7c-4da7-a3dc-9587e2596e72', '2026-07-25', '2026-07-25', '2026-07-25 07:52:00+02', '2026-07-25 17:04:00+02', '2026-07-25 12:20:00+02', '2026-07-25 13:00:00+02', 'present', true, true, NULL),
  ('656455be-058d-4e14-822f-b86acf1d2075', '2026-07-25', '2026-07-25', '2026-07-25 08:05:00+02', '2026-07-25 17:00:00+02', NULL, NULL, 'present', true,  true,  NULL),
  ('c0ac0c35-4492-4463-a4cc-bc799ebd934f', '2026-07-25', '2026-07-25', NULL,                     NULL,                     NULL, NULL, 'absent',  false, false, NULL);

-- ============================================================
-- EVENTS — one confirmed wedding, three weeks out
-- ============================================================
-- No stock allocation, per the brief: current_stock is at 0 and Sprint C makes
-- over-allocation fail closed, so an allocation would either be refused or
-- meaningless.
INSERT INTO public.events
  (id, name, event_type, event_date, start_time, end_time, guest_count, venue_area,
   organiser_name, organiser_contact, organiser_email, status, deposit_paid,
   deposit_required, special_requirements, notes, created_by)
VALUES
  ('e1000000-0000-4000-8000-000000000001',
   'Chikondi & James Wedding Reception', 'Wedding',
   '2026-08-15 00:00:00+00', '15:00', '23:00', 120, 'Lawn',
   'Chikondi Banda', '+265 991 204 118', 'chikondi.banda@gmail.com',
   'confirmed', false, 240000,
   'Marquee on the lawn, PA system for speeches, vegetarian option for 15 guests',
   'Site visit completed 18 July. Balance due one week before the event.',
   '73d1c4cc-8e06-4e86-a35c-d37bf1016d7c');

-- Bill items — categories match EventBillSection.jsx CATEGORIES exactly.
-- Total 800,000 MWK. All positive, per the amount CHECK from migration 023.
INSERT INTO public.event_bill_items (event_id, category, description, amount, created_by) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'Venue Hire', 'Lawn and marquee hire, full day', 350000, '73d1c4cc-8e06-4e86-a35c-d37bf1016d7c'),
  ('e1000000-0000-4000-8000-000000000001', 'Catering',   'Buffet menu, 120 guests',         380000, '73d1c4cc-8e06-4e86-a35c-d37bf1016d7c'),
  ('e1000000-0000-4000-8000-000000000001', 'Beverages',  'Welcome drinks and soft bar',      70000, '73d1c4cc-8e06-4e86-a35c-d37bf1016d7c');

-- No event_payments rows: the brief specifies no payments yet, so the event
-- shows a full 800,000 balance due.

-- ============================================================
-- TABLE BOOKINGS — 3 across the next 7 days, dinner service
-- ============================================================
-- party_size is within each table's capacity (T05=4, T02=2, T08=8).
-- One is today so the Dashboard "Today's Confirmed Bookings" panel is not empty.
INSERT INTO public.table_bookings
  (guest_name, guest_phone, guest_email, party_size, booking_date, booking_time,
   table_id, status, special_requests, created_by) VALUES
  ('Grace Phiri',   '+265 991 337 220', NULL,                       4, '2026-07-26 00:00:00+00', '19:30',
   '3461de4c-95af-4e94-9774-f88f98a09a6c', 'confirmed', NULL, '73d1c4cc-8e06-4e86-a35c-d37bf1016d7c'),
  ('Daniel Mwale',  '+265 888 512 904', 'd.mwale@gmail.com',         2, '2026-07-28 00:00:00+00', '20:00',
   '9dba3c08-20a6-43c4-9956-eb3c65302f62', 'confirmed', 'Quiet table if possible', '73d1c4cc-8e06-4e86-a35c-d37bf1016d7c'),
  ('Hannah Gondwe', '+265 995 771 640', 'hannah.gondwe@outlook.com', 8, '2026-08-01 00:00:00+00', '19:00',
   '144a2398-5b85-4201-9483-6c1383083a4e', 'confirmed', 'Birthday — cake to be brought in', '73d1c4cc-8e06-4e86-a35c-d37bf1016d7c');

COMMIT;
