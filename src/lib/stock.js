import { supabase } from './supabase'

/**
 * Atomic stock mutation helpers.
 *
 * Both wrap the Postgres functions added in migration 025. Each takes a row
 * lock on current_stock, writes current_stock AND stock_movements inside one
 * transaction, and fails closed if the result would go negative.
 *
 * They replace the read-then-write pattern that used to live in five places
 * (SELECT quantity -> arithmetic in JS -> UPDATE), which had no lock and no
 * transaction: two concurrent writers on the same stock item silently lost one
 * update, and the ledger row was a separate statement that could commit
 * without its balance change. See WOODLANDS_AUDIT_2.md §3 DoD 6(b).
 *
 * IMPORTANT: these insert the stock_movements row themselves. Never insert one
 * alongside a call — that produces a double ledger entry.
 *
 * Access is decided by RLS, not by these helpers. The functions are
 * SECURITY INVOKER, and migration 022 restricts current_stock and
 * stock_movements writes to owner/manager, so any other role gets a policy
 * error rather than a stock movement.
 *
 * Lives in src/lib rather than components/inventory so the events module can
 * use it without importing across feature folders.
 */

const MOVEMENT_TYPES = ['delivery', 'transfer', 'adjustment', 'requisition']

/**
 * Add `delta` to an item's balance. Negative to deduct.
 * Returns the new quantity. Throws on insufficient stock or RLS denial.
 */
export async function applyStockDelta(stockItemId, delta, {
  movementType,
  reason = null,
  fromDepartment = null,
  toDepartment = null,
} = {}) {
  if (!MOVEMENT_TYPES.includes(movementType)) {
    throw new Error(`applyStockDelta: movementType must be one of ${MOVEMENT_TYPES.join(', ')}`)
  }
  const { data, error } = await supabase.rpc('apply_stock_delta', {
    p_stock_item_id:   stockItemId,
    p_delta:           delta,
    p_movement_type:   movementType,
    p_reason:          reason,
    p_from_department: fromDepartment,
    p_to_department:   toDepartment,
  })
  if (error) throw error
  return Number(data)
}

/**
 * Set an item's balance to an absolute value — a stock take. The delta is
 * computed server-side under the lock, so it cannot be based on a stale read.
 * Records an 'adjustment' movement for the difference, and no movement at all
 * when the value is unchanged. Returns the new quantity.
 */
export async function setStockQuantity(stockItemId, newQty, reason = null) {
  const { data, error } = await supabase.rpc('set_stock_quantity', {
    p_stock_item_id: stockItemId,
    p_new_qty:       newQty,
    p_reason:        reason,
  })
  if (error) throw error
  return Number(data)
}
