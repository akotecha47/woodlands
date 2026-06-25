-- 016_staff_restructure.sql
-- Add missing columns to staff, lock down RLS, and seed 62 staff records.

-- ============================================================
-- 1. ADD MISSING COLUMNS
-- ============================================================
ALTER TABLE staff ADD COLUMN IF NOT EXISTS employee_number text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS position        text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS off_days        text[];
ALTER TABLE staff ADD COLUMN IF NOT EXISTS biometric_id   text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS notes          text;

-- ============================================================
-- 2. RLS + GRANTS  (idempotent — safe to re-run)
-- ============================================================
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_staff" ON staff;
DROP POLICY IF EXISTS "service_role_all_staff"   ON staff;

CREATE POLICY "authenticated_read_staff" ON staff
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role_all_staff" ON staff
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON staff TO service_role;

-- ============================================================
-- 3. SEED — 62 STAFF RECORDS
-- ============================================================
-- DUPLICATE EMPLOYEE NUMBER FLAG:
--   WL02473  → Cromwell Mtegha (Restaurant) keeps WL02473;
--              Peter Mphamba   (Housekeeping) gets suffix → WL02473B
--   WL026109 → Martin Ngalande & Rabourne Paul Phiri both use WL026109;
--              suffixed → WL026109A / WL026109B
--   WL02480  → unnamed Security Guard & Evance Limited Chikopa both use WL02480;
--              suffixed → WL02480A / WL02480B
-- Verify correct numbers with Martin before going live.

INSERT INTO staff (employee_number, full_name, position, department, hire_date, is_active) VALUES
  -- FRONT OFFICE
  ('WL02210',   'Secret Mtukula',           'Receptionist',                     'Front Office',        '2022-10-01'::date, true),
  ('WL02476',   'Chimwemwe Machira',        'Receptionist',                     'Front Office',        '2024-11-03'::date, true),

  -- ADMINISTRATION
  ('WL01701',   'Rose Ngalawango',          'Operations Manageress',            'Administration',      '2017-01-11'::date, true),
  ('WL026113',  'Martin Lisilira',          'HR Officer',                       'Administration',      '2026-03-27'::date, true),
  ('WL025103',  'Timothy Mkandawire',       'Accountant',                       'Administration',      '2025-09-01'::date, true),

  -- KITCHEN
  ('WL02520',   'Billy John',               'Continental Chef',                 'Kitchen',             '2025-01-16'::date, true),
  ('WL01822',   'Milika Banda',             'Continental Chef',                 'Kitchen',             '2018-09-04'::date, true),
  ('WL02353',   'Gift Kunsamba',            'Continental Chef',                 'Kitchen',             '2023-08-20'::date, true),
  ('WL02479',   'Brenda Soko',              'Continental Chef',                 'Kitchen',             '2024-10-01'::date, true),
  ('WL02470',   'James Chimkonde',          'Continental Chef',                 'Kitchen',             '2024-10-05'::date, true),
  ('WL026110',  'Thandie Dingaliro',        'Continental Chef',                 'Kitchen',             '2026-03-15'::date, true),
  ('WL02354',   NULL,                       'Continental Chef',                 'Kitchen',             '2023-10-01'::date, true),
  ('WL02341',   'Kondwani Tchaka',          'Continental Chef',                 'Kitchen',             '2023-07-03'::date, true),
  ('WL02560',   'Kondwani Jaziel',          'Assistant Tandoori Chef',          'Kitchen',             '2025-03-01'::date, true),
  ('WL02327',   'Francis Mkorongo',         'Assistant Indian Quisine Chef',    'Kitchen',             '2023-04-01'::date, true),
  ('WL02352',   NULL,                       'Assistant Indian Quisine Chef',    'Kitchen',             NULL,               true),
  ('WL02472',   'Samadu Phiri',             'Assistant Indian Quisine Chef',    'Kitchen',             '2024-07-03'::date, true),
  ('WL02342',   'Mike Mahobho',             'Pizza Chef',                       'Kitchen',             '2023-04-01'::date, true),
  ('WL01409',   'Mercy Kaphamtengo',        'Kitchen Porter',                   'Kitchen',             '2013-11-09'::date, true),
  ('WL02446',   'Carlos Khute',             'Kitchen Porter',                   'Kitchen',             '2026-03-17'::date, true),
  ('WL02475',   'Morry Kazembe',            'Kitchen Porter',                   'Kitchen',             '2024-07-13'::date, true),
  ('WL02351',   'Chikondi Chilambe',        'Kitchen Cleaner',                  'Kitchen',             '2023-10-15'::date, true),
  ('WL02328',   'Thoko Gomani',             'Staff Canteen Cook',               'Kitchen',             NULL,               true),

  -- RESTAURANT
  ('WL02358',   'Patrick Saulo',            'Waiter',                           'Restaurant',          '2023-12-01'::date, true),
  ('WL02135',   'Davies Chamba',            'Waiter',                           'Restaurant',          '2021-03-01'::date, true),
  ('WL01823',   'Webster Tcheza',           'Waiter',                           'Restaurant',          '2018-11-02'::date, true),
  ('WL01924',   'Daniel Msampha',           'Waiter',                           'Restaurant',          '2023-04-01'::date, true),
  ('WL02595',   NULL,                       'Waiter',                           'Restaurant',          NULL,               true),
  ('WL02337',   'Laurent Sichali',          'Waiter',                           'Restaurant',          '2023-04-01'::date, true),
  ('WL02463',   'Menolisa Chulu',           'Waitresses',                       'Restaurant',          '2022-10-06'::date, true),
  ('WL02025',   'Sunogie Pereira',          'Waiter',                           'Restaurant',          '2020-09-19'::date, true),
  ('WL02596',   'Alif Manajawira',          'Waiter',                           'Restaurant',          '2025-07-01'::date, true),
  ('WL02564',   'Oscar Nandolo',            'Waiter',                           'Restaurant',          '2025-01-21'::date, true),
  ('WL02473',   'Cromwell Mtegha',          'Waiter',                           'Restaurant',          '2025-05-15'::date, true),

  -- HOUSEKEEPING
  ('WL01912',   'Agness Kamande',           'Housekeeper',                      'Housekeeping',        '2019-02-15'::date, true),
  ('WL02359',   'Willard Phiri',            'Housekeeping Supervisor',          'Housekeeping',        '2023-12-04'::date, true),
  ('WL02318',   'Laston Manyamba',          'Laundry Assistant',                'Housekeeping',        '2023-03-01'::date, true),
  ('WL02574',   'Tadala Makina',            'Housekeeper',                      'Housekeeping',        '2025-04-01'::date, true),
  ('WL02239',   'James Kamanga',            'Laundry Assistant',                'Housekeeping',        '2022-04-25'::date, true),
  ('WL02473B',  'Peter Mphamba',            'Housekeeper',                      'Housekeeping',        '2024-10-07'::date, true),

  -- MAINTENANCE
  ('WL01413',   'William Mlowele',          'Maintenance Supervisor',           'Maintenance',         '2013-11-18'::date, true),
  ('WL02586',   'Henley Kazembe',           'Maintenance Assistant',            'Maintenance',         '2025-05-01'::date, true),
  ('WL02477',   'Andrew Ndilowe',           'Welder',                           'Maintenance',         '2024-09-01'::date, true),

  -- GROUNDS & LANDSCAPE
  ('WL02117',   'Charles Mafuta',           'Landscape and Grounds',            'Grounds & Landscape', '2021-07-27'::date, true),
  ('WL02321',   'Thomas Nyirongo',          'Landscape and Grounds',            'Grounds & Landscape', '2023-03-01'::date, true),
  ('WL25100',   'Clif Kaunda',              'Landscape and Grounds',            'Grounds & Landscape', '2025-08-01'::date, true),
  ('WL02592',   'Overton Samala',           'Landscape and Grounds Supervisor', 'Grounds & Landscape', '2025-07-01'::date, true),
  ('WL026108',  'Elia Sainani',             'Swimming Pool Attendant',          'Grounds & Landscape', NULL,               true),

  -- SECURITY
  ('WL01416',   'Dean Kussein',             'Head of Security',                 'Security',            '2014-08-01'::date, true),
  ('WL025381',  'Macfied Stonken',          'Security Guard',                   'Security',            '2026-01-10'::date, true),
  ('WL025105',  'Vincent Kafere',           'Security Guard',                   'Security',            '2026-02-18'::date, true),
  ('WL025104',  'Goldfrey Banda',           'Security Guard',                   'Security',            '2025-09-01'::date, true),
  ('WL026109A', 'Martin Ngalande',          'Security Guard',                   'Security',            '2026-04-17'::date, true),
  ('WL026109B', 'Rabourne Paul Phiri',      'Security Guard',                   'Security',            '2026-04-17'::date, true),
  ('WL026112',  'Duncan Leonard',           'Security Guard',                   'Security',            '2026-04-17'::date, true),
  ('WL02480A',  NULL,                       'Security Guard',                   'Security',            NULL,               true),
  ('WL02480B',  'Evance Limited Chikopa',   'Security Guard',                   'Security',            '2024-11-01'::date, true),

  -- BAR
  ('WL01519',   'Benard Gama',              'Bartender',                        'Bar',                 '2015-09-15'::date, true),
  ('WL02590',   'Kondwani Jumbo',           'Sports Bar Bartender',             'Bar',                 '2025-05-01'::date, true),
  ('WL02583',   'Nenenji Khumbo Chikafa',   'Bartender',                        'Bar',                 '2025-04-15'::date, true),

  -- TRANSPORT
  ('WL02467',   'Rown Joven',               'Driver',                           'Transport',           '2025-10-26'::date, true),
  ('WL02349',   'Alex Chitsulo',            'Driver',                           'Transport',           '2023-05-08'::date, true);
