-- 050_default_privileges_reconcile.sql
-- §2.6 reconciliation, part 5 of 5 — the GRANT layer.
--
-- Production restricts what anon / authenticated / service_role receive on a
-- newly created table. No migration file ever recorded that restriction, so a
-- from-files rebuild grants FULL DML to all three roles on every table by
-- default. Found by the second rebuild proof (12 August 2026): 588 grants on
-- the rebuild vs 435 on production.
--
-- WHY THIS IS NOT COSMETIC. Production defends the data twice: the GRANT layer
-- and RLS. A rebuild has only RLS. Today that is inert — every table has RLS
-- enabled and no policy anywhere targets anon, so anon is default-denied
-- regardless (verified on both databases during the proof). But it means a
-- single future migration that forgets `ENABLE ROW LEVEL SECURITY` — the exact
-- mistake CLAUDE.md rule 2 and standards.md §2 exist to prevent — would be
-- harmless on production and a full public data exposure on a rebuilt one.
-- The two databases would disagree about whether a bug is a breach.
--
-- Production's live pg_default_acl for postgres-owned objects in `public`
-- (read-only verified) is:
--     tables     anon/authenticated/service_role = Dxtm      (no DML)
--     sequences  anon/authenticated/service_role = w         (no SELECT/USAGE)
--     functions  postgres only                               (no EXECUTE)
-- against a fresh project's default of arwdDxtm / rwU / X for all three roles.
-- Sections 1-3 below reproduce exactly that.
--
-- ORDERING CAVEAT — the reason this file needs section 2 at all.
-- ALTER DEFAULT PRIVILEGES is NOT retroactive: it governs objects created
-- AFTER it runs. On a rebuild, all 28 tables already exist by the time this
-- file executes, so section 1 alone would leave every one of them carrying the
-- permissive grants. Section 2 therefore resets the existing tables explicitly
-- and section 3 re-grants exactly what production has. Section 1 then keeps
-- any table added by a FUTURE migration correct by default.
--
-- Section 3 deliberately restates grants that earlier migrations already
-- issued. That is not redundancy for its own sake: after section 2 revokes
-- everything, this file must be the complete and authoritative statement of
-- the matrix, or a table silently loses access it needs. It was generated
-- directly from production's live grant matrix, not transcribed by hand.
--
-- FILE-ONLY for production: production is already in this exact state. Record
-- with `supabase migration repair --status applied 050`. Do NOT execute it
-- there — section 2 briefly strips DML from every table in the schema, and
-- while section 3 restores it in the same transaction, there is no reason to
-- take that risk against live data for a no-op end state.

begin;

-- ── 1. Default privileges for objects created hereafter ─────────────────────
-- Matches production's pg_default_acl for postgres-owned objects in public.

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

-- No sequences exist in public today (all keys are uuid/gen_random_uuid), but
-- production carries the restriction, so it is reproduced for fidelity and to
-- cover any sequence a future migration introduces.
alter default privileges for role postgres in schema public
  revoke select, usage on sequences from anon, authenticated, service_role;

-- Functions: production grants EXECUTE to postgres only by default. This is
-- why 021/025/037 each pair their CREATE FUNCTION with an explicit
-- `revoke all ... from public` + `grant execute ... to authenticated,
-- service_role` — those files work WITH this default, and only make sense
-- once it is filed.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

-- ── 2. Reset the tables that already exist on a rebuild ─────────────────────
-- anon ends with zero DML anywhere, exactly as on production (verified live:
-- anon holds TRUNCATE/REFERENCES/TRIGGER only, on every table).

revoke select, insert, update, delete on all tables in schema public
  from anon, authenticated, service_role;

-- ── 3. Re-grant production's exact matrix ───────────────────────────────────
-- Generated from production's live information_schema.role_table_grants.
-- anon appears nowhere below by design — it holds no DML on production.
-- authenticated
grant SELECT, INSERT, UPDATE on public.attendance_records to authenticated;
grant SELECT, INSERT, UPDATE on public.current_stock to authenticated;
grant SELECT, INSERT, UPDATE on public.deliveries to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public.departments to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public.event_bill_items to authenticated;
grant SELECT, INSERT, UPDATE on public.event_checklists to authenticated;
grant SELECT, INSERT, UPDATE on public.event_configurations to authenticated;
grant SELECT, INSERT, UPDATE on public.event_payments to authenticated;
grant SELECT, INSERT, DELETE on public.event_staff to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public.event_stock_allocations to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public.events to authenticated;
grant SELECT, INSERT, DELETE on public.fm_approved_items to authenticated;
grant SELECT, INSERT, UPDATE on public.fm_holders to authenticated;
grant SELECT, INSERT, UPDATE on public.fm_id_cards to authenticated;
grant SELECT, INSERT, UPDATE on public.fm_market_days to authenticated;
grant SELECT, INSERT, DELETE on public.fm_payments to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public.fm_visits to authenticated;
grant SELECT, INSERT, UPDATE on public.inventory_items to authenticated;
grant SELECT, INSERT, UPDATE on public.requisitions to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public.shift_settings to authenticated;
grant SELECT, INSERT, UPDATE on public.staff to authenticated;
grant SELECT, INSERT, UPDATE on public.stock_adjustments to authenticated;
grant SELECT, INSERT, UPDATE on public.stock_items to authenticated;
grant SELECT, INSERT on public.stock_movements to authenticated;
grant SELECT, INSERT, UPDATE on public.stock_transfers to authenticated;
grant SELECT, INSERT, UPDATE on public.table_bookings to authenticated;
grant SELECT on public.tables to authenticated;
grant SELECT, INSERT, UPDATE on public.user_profiles to authenticated;

-- service_role
grant SELECT, INSERT, UPDATE, DELETE on public.attendance_records to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.current_stock to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.departments to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.event_bill_items to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.event_checklists to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.event_configurations to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.event_payments to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.event_staff to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.event_stock_allocations to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.events to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.fm_approved_items to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.fm_holders to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.fm_id_cards to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.fm_market_days to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.fm_payments to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.fm_visits to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.requisitions to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.shift_settings to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.staff to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.stock_items to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.stock_movements to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.table_bookings to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.tables to service_role;
grant SELECT, INSERT, UPDATE, DELETE on public.user_profiles to service_role;

commit;
