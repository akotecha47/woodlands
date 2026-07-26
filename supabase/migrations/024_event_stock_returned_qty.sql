-- 024_event_stock_returned_qty.sql
-- Sprint C / Task 3 Step 1 — persist what was actually deducted and returned.
--
-- ADDITIVE ONLY. Two nullable/defaulted columns and three COMMENTs. No data
-- is rewritten, no constraint added, nothing dropped.
--
-- ------------------------------------------------------------------
-- 1. returned_qty — AUDIT_2 §2.6(b) and §3 DoD 6(d)
-- ------------------------------------------------------------------
-- EventStockSection.jsx computes `returned` at :147 and correctly adds it back
-- to current_stock, but the .update() at :157-161 never wrote it, and the
-- column did not exist in any migration. The UI reads a.returned_qty at :206
-- and :319, so it has always rendered blank. The stock movement was right; the
-- audit trail of how much came back was absent.
--
-- ------------------------------------------------------------------
-- 2. deducted_qty — required by Task 3 Step 4
-- ------------------------------------------------------------------
-- Step 4 asks the cancel path to return "the actual amount deducted, not the
-- requested allocated_qty". That amount was never recorded anywhere, and event
-- stock deduction writes no stock_movements row, so there is no audit trail to
-- reconstruct it from. Storing it is the only way to satisfy the requirement.
--
-- Deliberately NULLABLE with no default. NULL means "deducted before Sprint C,
-- true amount unknown". Application code reads
-- `coalesce(deducted_qty, allocated_qty)`, so legacy rows behave exactly as
-- they do today while new rows are exact.
--
-- Live state at time of writing: 6 allocations — 4 `deducted` (16 units),
-- 2 `pending` (42 units). Those 4 deducted rows are the only ones carrying the
-- historical ambiguity. They are NOT backfilled: setting deducted_qty =
-- allocated_qty would assert the clamp never fired, which cannot be verified.
-- Leaving them NULL keeps the uncertainty visible in the data.
-- Logged in WOODLANDS_FOLLOWUPS.md.

ALTER TABLE public.event_stock_allocations
  ADD COLUMN IF NOT EXISTS returned_qty numeric DEFAULT 0;

ALTER TABLE public.event_stock_allocations
  ADD COLUMN IF NOT EXISTS deducted_qty numeric;

COMMENT ON COLUMN public.event_stock_allocations.deducted_qty IS
  'Quantity actually removed from current_stock when this allocation was deducted. NULL means the allocation predates Sprint C (2026-07-26) and the true amount is unknown — read as coalesce(deducted_qty, allocated_qty). Since Sprint C the deduct path fails closed on insufficient stock, so for new rows this always equals allocated_qty.';

COMMENT ON COLUMN public.event_stock_allocations.returned_qty IS
  'Quantity added back to current_stock when this allocation was cleared or cancelled. Complements consumed_qty: for a cleared allocation, consumed_qty + returned_qty should equal coalesce(deducted_qty, allocated_qty).';


-- ------------------------------------------------------------------
-- 3. Refund intent, recorded on the constraint itself
-- ------------------------------------------------------------------
-- Folded in here rather than as a `023a` file: migration 023 is already
-- applied and committed, and this project already carries ordering ambiguity
-- from the duplicate `008` pair (AUDIT_2 §2.6c) — a letter-suffixed filename
-- would add more. 024 is the next money/quantity-adjacent migration.
--
-- The comment lives on the constraint so any future session inspecting the
-- schema sees the intent without needing to find this file.

COMMENT ON CONSTRAINT event_payments_amount_positive ON public.event_payments IS
  'Amounts are always stored positive. Refunds use payment_type=refund and are subtracted in application code, not stored as negatives. Do NOT relax to allow negatives on this reasoning.';
