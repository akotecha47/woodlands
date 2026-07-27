-- ============================================================
-- Migration 030 — widen stock_movements.movement_type CHECK
-- Adds 'opening_balance' to permitted movement types
-- ============================================================
--
-- Rationale:
-- Migration 008 permits: delivery, transfer, adjustment, requisition.
-- The bar stock catalogue import needs a distinct type for the initial
-- balance so it is not conflated with operational stock takes
-- (movement_type = 'adjustment') in any later ledger view.
--
-- Forward-compatible with the deferred 'event_allocation' / 'event_return'
-- widening logged in WOODLANDS_FOLLOWUPS.md from Sprint C Task 4 — same
-- pattern, same migration shape when they land. That item remains OPEN;
-- this migration does not address it.
--
-- Idempotent — safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'stock_movements'
      AND c.conname = 'stock_movements_movement_type_check_v2'
  ) THEN
    ALTER TABLE stock_movements
      DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
    ALTER TABLE stock_movements
      ADD CONSTRAINT stock_movements_movement_type_check_v2
      CHECK (movement_type IN (
        'delivery', 'transfer', 'adjustment', 'requisition', 'opening_balance'
      ));
  END IF;
END $$;

COMMENT ON COLUMN stock_movements.movement_type IS
'Categorises the reason for the stock movement. opening_balance is used exclusively for the initial catalogue import; operational stock takes use adjustment.';
