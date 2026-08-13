-- ============================================================
-- Woodlands department vocabulary — orphan re-tag (follow-on to 003)
-- scripts/data-ops/004_department_orphan_retag.sql
-- Applied 13 August 2026
-- ============================================================
--
-- STATUS AT COMMIT: APPLIED to the live database, verified live after
-- apply on a fresh connection. This is a DATA-OPS record, NOT a
-- migration — same quarantine rule as 003: it must NEVER be replayed by
-- `supabase db push` or a from-files rebuild. It mutates real rows using
-- a vocabulary decision keyed to one specific data snapshot.
--
-- WHY: `scripts/data-ops/003_department_retag.sql` (12 August 2026)
-- reconciled three department sources to the 11-value canonical list —
-- the `departments` table, `staff.department` (62 rows), and
-- `stock_items.department` (559 rows). It did NOT cover the other three
-- department-bearing text columns in the inventory schema:
--
--   requisitions.department
--   stock_movements.from_department
--   stock_movements.to_department
--
-- Four rows in those columns were left tagged 'Restaurant Bar', a value
-- 003 renamed out of existence. Because `department_head` RLS scoping
-- (migration 039) matches `user_profiles.department` text against these
-- columns, and no user can hold a department of 'Restaurant Bar' (the
-- Add-User dropdown reads the `departments` table, which now offers
-- 'Main Bar'), those four rows are unreachable by every department_head
-- — orphaned from RLS. They are visible to owner/admin only.
--
-- The four rows, all created 27 July 2026 during the browser smoke test
-- that found the transfers bug:
--
--   requisitions    94a14cc7…  department='Restaurant Bar', qty 2, fulfilled
--   stock_movements 63ab73dd…  requisition, -2, to_department='Restaurant Bar'
--   stock_movements 06147eea…  transfer,   -1, from_department='Restaurant Bar'
--   stock_movements c01d1c9d…  transfer,   +1, from_department='Restaurant Bar'
--
-- (The last two are the matched −/+ pair the Transfers tab writes; their
-- `to_department` is 'Sports Bar', already canonical.)
--
-- DECISION: re-tag 'Restaurant Bar' → 'Main Bar', identical to the rename
-- 003 applied to `departments` and `stock_items`. This is a rename of one
-- vocabulary value, not a reassignment of history: the rows referred to
-- the bar now called Main Bar when they were written.
--
-- BASELINE BEFORE THIS SCRIPT (confirmed live, 13 August 2026):
--   requisitions.department (2 rows):        Kitchen(1), Restaurant Bar(1)
--   stock_movements.from_department (538):   Restaurant Bar(2), NULL(536)
--   stock_movements.to_department   (538):   Restaurant Bar(1), Sports Bar(2), NULL(535)
--
-- ============================================================

begin;

update requisitions
   set department = 'Main Bar'
 where department = 'Restaurant Bar';
-- expect: 1 row

update stock_movements
   set from_department = 'Main Bar'
 where from_department = 'Restaurant Bar';
-- expect: 2 rows

update stock_movements
   set to_department = 'Main Bar'
 where to_department = 'Restaurant Bar';
-- expect: 1 row

commit;

-- ============================================================
-- POST-APPLY VERIFICATION (run live on a fresh connection, 13 August 2026)
-- ============================================================
--
--   requisitions.department:        Kitchen(1), Main Bar(1)      — 2 rows, unchanged total
--   stock_movements.from_department: Main Bar(2), NULL(536)      — 538 rows, unchanged total
--   stock_movements.to_department:   Main Bar(1), Sports Bar(2), NULL(535) — 538 rows
--   Zero occurrences of 'Restaurant Bar' remain in ANY department-bearing
--   column across the schema (departments, staff, stock_items,
--   requisitions, stock_movements) — checked, not assumed.
--
-- No `supabase db push` was run. Hand-applied DML via the Management API
-- query endpoint, per standards.md §7.
-- ============================================================
