-- 027_fm_visits_notes.sql
-- Ghost column: fm_visits.notes is read and written by the UI but was created
-- by no migration and did not exist in the live database.
--
-- ADDITIVE ONLY. One nullable column. No policy or grant change is needed —
-- migration 022 granted authenticated SELECT/INSERT/UPDATE/DELETE on fm_visits
-- at table level, and the write policies are role-scoped there, so the new
-- column inherits both.
--
-- ------------------------------------------------------------------
-- WHERE IT IS USED
-- ------------------------------------------------------------------
--   MarketDayTab.jsx:122   .update({ notes: visitNote || null }) — the "Any
--                          notes for this visit?" prompt shown to a manager
--                          straight after checking a stall holder in
--   MarketDayTab.jsx:414   renders a 📝 marker when visit.notes is set
--   MarketDayTab.jsx:423   same, in the second row layout
--   HoldersTab.jsx:203     builds notesMap from visit rows for the per-holder
--                          visit history table
--
-- Manager-side check-in itself has been working — the live table holds visit
-- rows for past market days — so only the notes step of that flow failed, with
-- an undefined_column error surfaced as a generic toast.
--
-- ------------------------------------------------------------------
-- WHY THIS EXISTS AS A SEPARATE MIGRATION
-- ------------------------------------------------------------------
-- Found while fixing Bug 5, where the public /checkin write path failed because
-- migration 014 (checked_in_at / checked_out_at) had never been applied. Same
-- class of fault on the same table, but a different feature and a genuinely
-- missing migration rather than an unapplied one, so it is recorded separately
-- rather than folded into that fix.
--
-- This is the second ghost column found in this schema after
-- event_stock_allocations.returned_qty (AUDIT_2 §2.6(b), added in migration
-- 024). Both were written by the UI and absent from the database.

ALTER TABLE public.fm_visits ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.fm_visits.notes IS
  'Free-text note a manager records against a single stall holder visit, captured by the prompt after check-in on the Market Day tab. Distinct from fm_market_days.notes, which describes conditions for the whole market day.';
