-- 023_amount_check_constraints.sql
-- Sprint C / Task 2 — server-side floor on every money column.
--
-- Governing doctrine: STREAMLINE_BUILD_STANDARD.md v1.5 §3 Definition of Done,
-- "Any money/quantity calculation is guarded against the obvious lie: negatives,
-- double-inserts, timezone/date-boundary errors."
--
-- Closes WOODLANDS_AUDIT_2.md §3 DoD 6(c): grepping every CHECK across
-- migrations 001-022 found none on any `amount` column. The sole guard was the
-- HTML attribute min="0.01" at EventPaymentsSection.jsx:186 — client-side, and
-- trivially bypassed by anyone posting straight to PostgREST with the
-- publishable key. A negative "payment" inserted cleanly and moved balanceDue
-- in the payer's favour.
--
-- ADDITIVE ONLY. No table, column or row is altered.
--
-- ------------------------------------------------------------------
-- PRE-VALIDATION (run against the live DB before writing this file)
-- ------------------------------------------------------------------
--   event_payments   amount <= 0 : 0 rows   (7 total)
--   fm_payments      amount <= 0 : 0 rows   (17 total)
--   event_bill_items amount <= 0 : 0 rows   (7 total)
--   NULL amounts on all three    : 0 rows
--
-- All three validate cleanly, so no NOT VALID clause is used — these
-- constraints apply to existing rows as well as new ones.
--
-- ------------------------------------------------------------------
-- WHY `> 0` AND NOT `>= 0`
-- ------------------------------------------------------------------
-- Refunds are NOT stored as negative amounts. event_payments carries
-- payment_type = 'refund' with a POSITIVE amount, and the UI subtracts it:
-- EventPaymentsSection.jsx:46-48 sums refunds separately and :156-159 renders
-- them parenthesised in red. So `amount > 0` does not block a refund, and a
-- negative amount is unambiguously a defect rather than a legitimate credit.
--
-- Note for later: `event_bill_items.amount > 0` also forbids a zero-value
-- line, so a genuinely complimentary item cannot be recorded at 0. No such row
-- exists today. If comped lines are wanted, that is a deliberate product
-- decision and this constraint must be relaxed to `>= 0` in a new migration
-- rather than dropped. Logged in WOODLANDS_FOLLOWUPS.md.
--
-- Idempotent: Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each is
-- guarded by a pg_constraint lookup.

-- ==================================================================
-- event_payments.amount
-- ==================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname  = 'event_payments_amount_positive'
       AND conrelid = 'public.event_payments'::regclass
  ) THEN
    ALTER TABLE public.event_payments
      ADD CONSTRAINT event_payments_amount_positive CHECK (amount > 0);
  END IF;
END $$;

-- ==================================================================
-- fm_payments.amount
-- ==================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname  = 'fm_payments_amount_positive'
       AND conrelid = 'public.fm_payments'::regclass
  ) THEN
    ALTER TABLE public.fm_payments
      ADD CONSTRAINT fm_payments_amount_positive CHECK (amount > 0);
  END IF;
END $$;

-- ==================================================================
-- event_bill_items.amount
-- ==================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname  = 'event_bill_items_amount_positive'
       AND conrelid = 'public.event_bill_items'::regclass
  ) THEN
    ALTER TABLE public.event_bill_items
      ADD CONSTRAINT event_bill_items_amount_positive CHECK (amount > 0);
  END IF;
END $$;
