-- 047_table_bookings_unfiled_columns_reconcile.sql
-- §2.6 reconciliation, part 2 of 5 — the `table_bookings` table.
--
-- Records six columns and one foreign key that exist on production but appear
-- in NO migration file. Found by the second rebuild proof (12 August 2026).
-- Same defect class as the 016 full_name drift and 046.
--
-- These are not incidental columns. `guest_name` / `guest_phone` /
-- `guest_email` are the column names CLAUDE.md and standards.md §10 MANDATE
-- for customer-facing bookings ("Customer-facing bookings: guest_name,
-- guest_phone, guest_email"). The live table follows the standard correctly;
-- the migration files never recorded that it does. A rebuild produced a
-- `table_bookings` the Table Bookings module could not run against.
--
-- Every definition below was read directly off production (read-only). The
-- ADD COLUMN order reproduces production's ordinal_position 14-19.
--
-- FILE-ONLY for production: production already has all of this. Record with
-- `supabase migration repair --status applied 047`; do not execute it there.
--
-- REBUILD ORDERING: `table_id` carries a foreign key to `tables(id)`.
-- `tables` is created by 033_tables.sql, which runs well before this file, so
-- there is no forward reference on a clean rebuild from empty. This is
-- precisely why the FK is filed here rather than folded back into
-- 001_schema.sql, where `tables` would not yet exist.

begin;

-- ── Columns (production ordinal_position 14-19, in order) ────────────────────

alter table public.table_bookings
  add column if not exists guest_name   text,
  add column if not exists guest_phone  text,
  add column if not exists guest_email  text,
  add column if not exists booking_time time without time zone,
  add column if not exists table_id     uuid,
  add column if not exists notes        text;

-- ── Foreign key: table_id -> tables(id) ─────────────────────────────────────
-- Matches production exactly: no ON DELETE clause (i.e. NO ACTION), not
-- deferrable. Guarded so the file stays idempotent — ADD CONSTRAINT has no
-- IF NOT EXISTS form in Postgres.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'table_bookings_table_id_fkey'
  ) then
    alter table public.table_bookings
      add constraint table_bookings_table_id_fkey
      foreign key (table_id) references public.tables(id);
  end if;
end $$;

-- ── Nullability drift (same class as 016) ───────────────────────────────────
-- 001_schema.sql:161 declares `customer_name text NOT NULL`. Production is
-- nullable. Confirmed live why: `guest_name` is the column the application
-- actually writes — of the 3 live booking rows, all 3 have `guest_name` set
-- and all 3 have `customer_name` NULL. `customer_name` is vestigial,
-- superseded by the standards-mandated `guest_name`. A rebuild that kept
-- NOT NULL would reject every booking the app creates.
alter table public.table_bookings alter column customer_name drop not null;

commit;
