-- Task 1 — purge transactional test data.
-- Order matters: event_payments -> events is ON DELETE NO ACTION, so payments
-- must go first or the events delete raises a FK violation.
-- Children are deleted explicitly even where a CASCADE exists, so each step is
-- independently verifiable rather than implicit.

BEGIN;

-- ---- Events subtree -------------------------------------------------------
DELETE FROM public.event_payments;           -- blocks events (NO ACTION)
DELETE FROM public.event_stock_allocations;  -- CASCADE, explicit anyway
DELETE FROM public.event_bill_items;         -- CASCADE
DELETE FROM public.event_checklists;         -- CASCADE
DELETE FROM public.event_staff;              -- CASCADE
DELETE FROM public.event_configurations;     -- CASCADE
DELETE FROM public.events;

-- ---- Table bookings -------------------------------------------------------
DELETE FROM public.table_bookings;

-- ---- Attendance -----------------------------------------------------------
DELETE FROM public.attendance_records;

-- ---- Inventory transactions (master data preserved) -----------------------
DELETE FROM public.requisitions;
DELETE FROM public.stock_movements;

-- ---- Farmers Market subtree ----------------------------------------------
DELETE FROM public.fm_approved_items;  -- CASCADE from fm_holders
DELETE FROM public.fm_id_cards;        -- CASCADE
DELETE FROM public.fm_payments;        -- CASCADE
DELETE FROM public.fm_visits;          -- CASCADE
DELETE FROM public.fm_holders;
DELETE FROM public.fm_market_days;

-- ---- Reset stock balances, keep the rows ---------------------------------
-- current_stock rows represent items that exist; only the balance is cleared.
UPDATE public.current_stock
   SET quantity = 0, last_updated = now();

COMMIT;
