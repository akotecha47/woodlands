-- 046_events_unfiled_columns_reconcile.sql
-- §2.6 reconciliation, part 1 of 5 — the `events` table.
--
-- Records twelve columns that exist on production but appear in NO migration
-- file. Found by the second rebuild proof (12 August 2026), which pushed
-- 001-045 into an empty database without error and then diffed the result
-- against production: `events` came back twelve columns short. Same defect
-- class as the 016 full_name drift — hand-applied DDL that was never filed,
-- accumulated over months of feature work.
--
-- Every definition below was read directly off production (read-only) before
-- being written here; nothing is inferred. Types, nullability and defaults
-- match live exactly, and the ADD COLUMN order reproduces production's
-- ordinal_position 19-30 so a rebuilt table has the same column order, not
-- merely the same column set.
--
-- FILE-ONLY for production: production already has all of this. Do NOT run
-- this file against production — record it with
-- `supabase migration repair --status applied 046`. Written with
-- ADD COLUMN IF NOT EXISTS so that even if it were run, it is a no-op.
--
-- NOTE ON THE ORGANISER COLUMNS. `events` carries BOTH spellings live:
-- `organizer_name` / `organizer_contact` (American, from 001_schema.sql:123-124)
-- and `organiser_name` / `organiser_contact` / `organiser_email` (British,
-- added here). standards.md §10 mandates the British spelling, so the American
-- pair is the vestigial one. Both are reproduced because both are live — this
-- file's job is fidelity to production, not cleanup. Retiring the American
-- pair is a separate decision, logged in WOODLANDS_FOLLOWUPS.md.
--
-- NOTE ON deposit_paid. On `events` this is BOOLEAN (default false) — a flag.
-- On `table_bookings` a column of the same name is NUMERIC NOT NULL DEFAULT 0
-- (an amount). Same name, different tables, different types. Verified live on
-- both; do not "harmonise" them without checking the app.

begin;

-- ── Columns (production ordinal_position 19-30, in order) ────────────────────

alter table public.events
  add column if not exists deposit_paid         boolean default false,
  add column if not exists deposit_required     numeric default 0,
  add column if not exists start_time           time without time zone,
  add column if not exists end_time             time without time zone,
  add column if not exists venue_area           text,
  add column if not exists organiser_name       text,
  add column if not exists organiser_contact    text,
  add column if not exists organiser_email      text,
  add column if not exists special_requirements text,
  add column if not exists guest_count          integer,
  add column if not exists notes                text,
  add column if not exists name                 text;

-- ── Nullability drift (same class as 016) ───────────────────────────────────
-- 001_schema.sql:116 declares `title text NOT NULL`. Production is nullable.
-- Confirmed live why: `name` is the column the application actually writes —
-- of the 1 live event row, `name` is populated and `title` is NULL. `title` is
-- vestigial, superseded by `name`, and the NOT NULL was dropped by hand at
-- some point so rows could be written without it. A rebuild that kept
-- NOT NULL would reject every row the app creates.
alter table public.events alter column title drop not null;

commit;
