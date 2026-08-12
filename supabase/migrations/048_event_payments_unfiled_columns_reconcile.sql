-- 048_event_payments_unfiled_columns_reconcile.sql
-- §2.6 reconciliation, part 3 of 5 — the `event_payments` table.
--
-- Records two columns and one foreign key that exist on production but appear
-- in NO migration file. Found by the second rebuild proof (12 August 2026).
--
-- `received_by` is the sharpest example of this whole defect class. It is the
-- subject of an entire WOODLANDS_FOLLOWUPS.md entry ("Sprint B — Task 4 smoke
-- test" and "Sprint C — Task 1"): the Add Payment bug of 28 May 2026, where
-- the dropdown populated from `staff` while the column's FK points at
-- `auth.users(id)`, diagnosed at length and fixed in Sprint C by re-pointing
-- the dropdown at `user_profiles`. Every word of that analysis is about a
-- column that has never existed in a migration file. The FK it turns on —
-- `received_by -> auth.users(id)`, as opposed to `recorded_by ->
-- user_profiles(id)` — is filed here for the first time.
--
-- Definitions read directly off production (read-only). ADD COLUMN order
-- reproduces production's ordinal_position 10-11.
--
-- FILE-ONLY for production: record with
-- `supabase migration repair --status applied 048`; do not execute there.
--
-- REBUILD ORDERING: the FK targets `auth.users`, which Supabase provisions
-- before any project migration runs, so there is no forward reference.

begin;

-- ── Columns (production ordinal_position 10-11, in order) ────────────────────

alter table public.event_payments
  add column if not exists received_by uuid,
  add column if not exists reference   text;

-- ── Foreign key: received_by -> auth.users(id) ──────────────────────────────
-- Matches production exactly: no ON DELETE clause (NO ACTION), not deferrable.
-- Deliberately NOT user_profiles(id) — that is `recorded_by`'s target, and the
-- asymmetry between the two columns is the documented cause of the 28 May
-- Add Payment bug. Reproduced as-is; changing it is a schema decision, not a
-- reconciliation, and is out of scope here.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_payments_received_by_fkey'
  ) then
    alter table public.event_payments
      add constraint event_payments_received_by_fkey
      foreign key (received_by) references auth.users(id);
  end if;
end $$;

commit;
