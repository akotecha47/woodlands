-- ============================================================
-- Woodlands department vocabulary re-tag
-- scripts/data-ops/003_department_retag.sql
-- Applied 12 August 2026
-- ============================================================
--
-- STATUS AT COMMIT: APPLIED to the live database, verified live after
-- each sub-step. This is a DATA-OPS record, NOT a migration — it is
-- quarantined from the migration path deliberately and must NEVER be
-- replayed by `supabase db push` or a from-files rebuild. It mutates
-- real rows (62 staff, 559 stock_items, the departments table) using a
-- one-time placeholder decision (the Bar split below) that would be
-- wrong to blindly reapply against a different data snapshot. If a
-- rebuild ever needs this vocabulary, the CANONICAL LIST below should
-- be re-derived from a fresh live snapshot at that time, not by
-- replaying this file's UPDATEs against unknown rows.
--
-- WHY: three department vocabularies had drifted independently across
-- `departments` (7 rows, dropdown source), `staff.department` (62 rows,
-- roster), and `stock_items.department` (559 rows, bar import). Phase 2's
-- `department_head` RLS scoping (migration 039) matches
-- `user_profiles.department` text against `staff`/`stock_items`
-- department text — so scoping correctness depended entirely on these
-- three columns sharing one vocabulary. See WOODLANDS_FOLLOWUPS.md,
-- "PHASE 2 ROLE MODEL — deferred items" (11 August 2026 entry).
--
-- CANONICAL LIST (11 values):
--   Administration, Main Bar, Sports Bar, Front Office,
--   Grounds & Landscape, Housekeeping, Kitchen, Maintenance,
--   Restaurant, Security, Transport
--
-- BASELINE BEFORE THIS SCRIPT (confirmed live, 12 August 2026):
--   departments (7):     Grounds, Housekeeping, Kitchen, Restaurant,
--                         Restaurant Bar, Security, Sports Bar
--   staff.department (10, 62 rows): Administration(3), Bar(3),
--                         Front Office(2), Grounds & Landscape(5),
--                         Housekeeping(6), Kitchen(18), Maintenance(3),
--                         Restaurant(11), Security(9), Transport(2)
--   stock_items.department (2, 559 rows): Restaurant Bar(276),
--                         Sports Bar(283)
--   Matched WOODLANDS_FOLLOWUPS.md's recorded table exactly — no delta.
--
-- ============================================================

begin;

-- ── 1. departments table: rename + add the 4 missing canonical rows ─────────
-- (Kitchen, Housekeeping, Restaurant, Security, Sports Bar already canonical)

update departments set name = 'Main Bar'            where name = 'Restaurant Bar';
update departments set name = 'Grounds & Landscape'  where name = 'Grounds';

insert into departments (name) values
  ('Administration'),
  ('Front Office'),
  ('Maintenance'),
  ('Transport');

-- Verified live: 11 rows, exact canonical set, no duplicates (departments.name is UNIQUE).

-- ── 2. stock_items.department: rename Restaurant Bar → Main Bar ─────────────
-- Sports Bar was already canonical.

update stock_items set department = 'Main Bar' where department = 'Restaurant Bar';

-- Verified live: Main Bar 276 / Sports Bar 283 = 559 total, unchanged.

-- ── 3. staff.department: the Bar split ───────────────────────────────────────
-- The 9 non-Bar roster values (Administration, Front Office,
-- Grounds & Landscape, Housekeeping, Kitchen, Maintenance, Restaurant,
-- Security, Transport) already matched canonical exactly — no UPDATE
-- needed for those 53 rows.
--
-- The 3 "Bar" rows required a split with no department column to key on.
-- Aman's call (confirmed 12 August 2026), reasoned per-row rather than a
-- blind guess:
--   - Kondwani Jumbo (c0ac0c35-4492-4463-a4cc-bc799ebd934f) — DATA-CONFIRMED
--     Sports Bar. staff.position already read "Sports Bar Bartender" before
--     this script ran; the department value is corrected to match data
--     that already existed, not assigned.
--   - Benard Gama (62a988dc-ee5e-45aa-a548-8ba2d3e5dd75) and
--     Nenenji Khumbo Chikafa (439f2fa1-bcd4-4816-b287-8befebf70845) — both
--     PLACEHOLDER Main Bar. Their position is generic "Bartender" with no
--     bar named; no data indicates which bar. To be finalised at
--     real-data time with Rose.

update staff set department = 'Sports Bar'
 where id = 'c0ac0c35-4492-4463-a4cc-bc799ebd934f';   -- Kondwani Jumbo, data-confirmed

update staff set department = 'Main Bar'
 where id in (
   '62a988dc-ee5e-45aa-a548-8ba2d3e5dd75',              -- Benard Gama, placeholder
   '439f2fa1-bcd4-4816-b287-8befebf70845'                -- Nenenji Khumbo Chikafa, placeholder
 );

-- Verified live: 62 total unchanged, now 11 distinct values, all canonical.
-- Main Bar 2 / Sports Bar 1.

commit;

-- ============================================================
-- POST-APPLY VERIFICATION (all run live, 12 August 2026)
-- ============================================================
--
-- departments: 11 rows, exact canonical set, no duplicates.
-- stock_items: Main Bar 276 / Sports Bar 283, total 559.
-- staff: 62 total, 11 distinct canonical department values.
-- fm_holders: 305 (untouched by this script).
-- attendance_records: 15 (untouched by this script).
--
-- department_head scoping re-proved as the roles themselves (SET LOCAL
-- ROLE authenticated, real sub, every test wrapped in a transaction that
-- rolled back — never run as postgres, which bypasses RLS):
--   - Main Bar head  sees stock_items grouped to exactly {Main Bar: 276}.
--   - Sports Bar head sees stock_items grouped to exactly {Sports Bar: 283}.
--   - Kitchen head sees 0 stock_items. Confirmed as data-absence, not
--     policy failure: `select count(*) from stock_items where
--     department = 'Kitchen'` = 0, run as postgres (no RLS).
--   - Both temporary re-points (Kitchen-head and Restaurant-head profiles,
--     used to stand in for Main Bar / Sports Bar heads — no such heads
--     exist yet) were made and rolled back inside the same transaction as
--     the read; user_profiles.department re-queried after each rollback
--     and confirmed unchanged (Kitchen, Restaurant respectively).
--
-- No `supabase db push` was run. This file is a record of hand-applied
-- DML via the Management API query endpoint, per standards.md §7.
-- ============================================================
