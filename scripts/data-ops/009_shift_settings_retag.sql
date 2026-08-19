-- ============================================================
-- Woodlands shift_settings department re-tag
-- scripts/data-ops/009_shift_settings_retag.sql
-- Applied 19 August 2026
-- ============================================================
--
-- STATUS AT COMMIT: APPLIED to the live database, dry-run first inside a
-- rolled-back transaction, verified live after. This is a DATA-OPS record,
-- NOT a migration -- it is quarantined from the migration path deliberately
-- and must NEVER be replayed by `supabase db push` or a from-files rebuild.
-- It mutates real rows against one specific data snapshot. No DDL, no new
-- SQL object, no schema change: the 062 rebuild-proof gate is untouched.
--
-- WHY: data-ops/003 re-tagged `departments`, `staff.department` and
-- `stock_items.department` to the canonical 11-value vocabulary on
-- 12 August 2026 -- and missed `shift_settings.department`, which nothing
-- at the time read. `TodayTab`/`HistoryTab` resolve a staff member's shift by
-- matching `shift_settings.department` against `staff.department`
-- (`getShiftForDept`, AttendanceUI.jsx:76), so every staff member in a
-- department whose shift rows kept a pre-003 name matched NO shift: Shift
-- column "--", no late-minutes calc, no overtime flag, and the coverage-alert
-- loop could never fire for them. The shift pickers in AddUserTab/UsersTab
-- were likewise empty for those departments. WOODLANDS_AUDIT_3.md C-12.1
-- (P1), decision D-2.
--
-- BASELINE BEFORE THIS SCRIPT (measured live, 19 August 2026 --
-- 12 rows, 8 distinct departments):
--   Front Desk       2  (Shift 1 06:00-14:00, Shift 2 14:00-22:00, standard)
--   Grounds          1  (Standard 08:30-16:30)
--   Housekeeping     1  (Standard 08:30-16:30)          <- already canonical
--   Kitchen          1  (Standard 08:30-16:30)          <- already canonical
--   Restaurant       2  (Shift 1, Shift 2)              <- already canonical
--   Restaurant Bar   2  (Week A, Week B, rotating)
--   Security         1  (Standard 08:30-16:30)          <- already canonical
--   Sports Bar       2  (Week A, Week B, rotating)      <- already canonical
--
-- THREE stale values, not the two AUDIT_3 C-12 names explicitly:
-- `Grounds` is the third (C-12 says "measured live values include ...").
-- Its canonical target is the same one data-ops/003 already applied to the
-- `departments` table itself (`Grounds` -> `Grounds & Landscape`), and it
-- strands 5 Grounds & Landscape staff on "--" for exactly the same reason.
-- Fixing two of three would leave the bug half-live, so all three are re-tagged.
--
-- Each target is verified to exist in `departments` (the canonical 11) and to
-- have NO pre-existing shift_settings rows, so no row is merged or duplicated:
--   Restaurant Bar -> Main Bar             (departments: yes, existing rows: 0)
--   Front Desk     -> Front Office         (departments: yes, existing rows: 0)
--   Grounds        -> Grounds & Landscape  (departments: yes, existing rows: 0)
-- The five already-canonical departments are NOT touched.
--
-- KNOWN SIDE EFFECT, accepted (D-2): Main Bar's two rows are `rotating`
-- Week A / Week B, and `TodayTab.getShift` hard-codes the current week to 'A'
-- (TodayTab.jsx:100 -- AUDIT_3 C-05). So Main Bar staff will always resolve to
-- Week A. Both weeks are 08:30-22:00 with the same late threshold, so the
-- displayed shift is identical either way today; the hardcode is a real bug but
-- an invisible one, and is left for a later block. A visible correct shift beats
-- "--". Sports Bar already had this behaviour and is unchanged by this file.
--
-- ============================================================

begin;

update shift_settings set department = 'Main Bar'
 where department = 'Restaurant Bar';                  -- 2 rows (rotating Week A/B)

update shift_settings set department = 'Front Office'
 where department = 'Front Desk';                      -- 2 rows (Shift 1/Shift 2)

update shift_settings set department = 'Grounds & Landscape'
 where department = 'Grounds';                         -- 1 row (Standard)

commit;

-- ============================================================
-- DRY RUN (run first, 19 August 2026, inside a transaction that ROLLED BACK;
-- shift_settings re-queried afterwards and confirmed unchanged at the baseline
-- above before this file was applied for real)
-- ============================================================
--
-- After the re-tag, 12 rows / 8 departments, 0 rows holding a department name
-- absent from `departments`. Shift resolution simulated exactly as
-- getShiftForDept does it (rotating -> Week A; multiple standard -> the window
-- containing now; else the single row), joined from staff.department:
--
--   Administration        3 staff  -> NONE (no shift rows exist)
--   Front Office          2 staff  -> Shift 1 06:00-14:00     <-- WAS "--"
--   Grounds & Landscape   5 staff  -> Standard 08:30-16:30    <-- WAS "--"
--   Housekeeping          6 staff  -> Standard 08:30-16:30
--   Kitchen              18 staff  -> Standard 08:30-16:30
--   Main Bar              2 staff  -> Week A 08:30-22:00      <-- WAS "--"
--   Maintenance           3 staff  -> NONE (no shift rows exist)
--   Restaurant           11 staff  -> Shift 1 06:00-14:00
--   Security              9 staff  -> Standard 08:30-16:30
--   Sports Bar            1 staff  -> Week A 08:30-22:00
--   Transport             2 staff  -> NONE (no shift rows exist)
--
-- 8 of the 62 staff (Administration 3, Maintenance 3, Transport 2) still show
-- "--" because those three departments have NO shift_settings row at all --
-- the group counts above sum to 62. That is a DATA GAP, not
-- a stale tag: nothing to re-tag, and inventing shift times for them is Rose's
-- call, not this script's. Logged as a followup, deliberately out of scope.
--
-- No `supabase db push` was run. Hand-applied DML via the Management API query
-- endpoint through scripts/apply-sql.ps1, per standards.md section 7.
-- ============================================================
