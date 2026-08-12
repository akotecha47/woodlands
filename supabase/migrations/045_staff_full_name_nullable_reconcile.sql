-- 045_staff_full_name_nullable_reconcile.sql
-- Records unfiled drift found by the §2.6 rebuild proof (throwaway staging
-- project, 12 August 2026): production's staff.full_name is nullable, but
-- every migration file said NOT NULL (001_schema.sql:88) with nothing in
-- 002-044 ever relaxing it. A from-empty rebuild hit this directly — 016's
-- own seed INSERT carries 4 rows with full_name = NULL (real employees whose
-- names were never captured; see 016's SEED section) and was rejected by the
-- NOT NULL constraint that only exists in the files, not in production.
--
-- Root fix lives in 016_staff_restructure.sql itself (an ALTER immediately
-- before its seed INSERT) — a later-numbered migration cannot help 016
-- succeed on a fresh rebuild, since 016 runs first. This file exists so the
-- reconciliation has its own dated entry in the migration history, the way
-- Session B's 010-defaults documentation did.
--
-- FILE-ONLY for production: production already has this relaxation (applied
-- by hand, at an unknown point, unfiled). Do NOT run this file's DDL against
-- production — it is already true there. Record it via
-- `supabase migration repair --status applied 045` instead, the same
-- handling as 010 in Session B. This file's DDL is for the REBUILD path
-- (a fresh database, where 016 already does the actual relaxation) — running
-- it here too is a no-op by construction (ALTER ... DROP NOT NULL on an
-- already-nullable column succeeds silently) and exists only so the fact is
-- traceable in the file set, not just buried in a comment inside 016.
--
-- Class of defect: column-CONSTRAINT drift (hand-applied ALTER, never
-- filed) — distinct from the ghost-table / ghost-column drift Sessions A and
-- B reconciled. Neither session checked constraints. Future audits should.

begin;

alter table public.staff alter column full_name drop not null;

commit;
