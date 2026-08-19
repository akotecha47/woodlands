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

// Kept in step with the table CHECK (stock_movements_movement_type_check_v5)
// and the allowlist inside apply_stock_delta. All three are widened in the
// same migration or they drift — 'issue' was added in 055,
// 'event_allocation'/'event_return' in 058, 'consumption' in 060.
// Note 'opening_balance' is permitted by the table but deliberately absent
// here and in the RPC: it is import-only (scripts/data-ops/002).
const MOVEMENT_TYPES = [
  'delivery', 'transfer', 'adjustment', 'requisition', 'issue',
  'event_allocation', 'event_return', 'consumption',
]

/**
 * Add `delta` to an item's balance. Negative to deduct.
 * Returns the new quantity. Throws on insufficient stock or RLS denial.
 */
export async function applyStockDelta(stockItemId, delta, {
  movementType,
  reason = null,
  fromDepartment = null,
  toDepartment = null,
  // WHICH BALANCE ROW is touched. apply_stock_delta resolves
  // `coalesce(p_location, stock_items.department)` and matches
  // `sub_location IS NOT DISTINCT FROM p_sub_location` (migration 060:370).
  // Left null these keep the pre-existing behaviour exactly — the item's own
  // catalogue department, no sub-location. Naming the location explicitly is
  // what lets a caller READ the same row it is about to WRITE (see
  // allocatableQuantities below); leaving it to the fallback means the read and
  // the write can disagree once an item is held in more than one place.
  location = null,
  subLocation = null,
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
    p_location:        location,
    p_sub_location:    subLocation,
  })
  if (error) throw error
  return Number(data)
}

/**
 * How much of each item an EVENT can actually draw — the balance
 * `applyStockDelta` will deduct from, and no other.
 *
 * An item does NOT have one department-tier balance. Migration 051 gives it a
 * main-store row as well, and a sub-location splits the department tier further
 * still: live, HK-005/006/007 each hold TWO department-tier rows, `Housekeeping`
 * and `Housekeeping -> Laundry`. Both readers of "how much is available" assumed
 * one row per item and were wrong in opposite directions (AUDIT_3 C-18): the
 * event-confirm pre-flight used `.eq('tier','department').maybeSingle()`, which
 * THROWS "multiple (or no) rows returned" and aborted the whole confirm; the
 * allocation dropdown built a map keyed by item alone, so whichever row arrived
 * last silently won and the Laundry balance could be shown as the Housekeeping one.
 *
 * The row that matters is the one the deduction lands on: the item's catalogue
 * department, with NO sub-location. That is what this returns, and event callers
 * pass the same `location` to applyStockDelta so the two cannot drift.
 *
 * `items` is [{ id, department }] (stock_items rows). Returns a
 * Map<stock_item_id, number>; an item with no such balance row maps to 0 rather
 * than being absent, because "none in the department" is a real answer.
 */
export async function allocatableQuantities(items) {
  const list = (items ?? []).filter(i => i?.id)
  const out = new Map(list.map(i => [i.id, 0]))
  if (list.length === 0) return out

  const { data, error } = await supabase
    .from('current_stock')
    .select('stock_item_id, location, quantity')
    .in('stock_item_id', list.map(i => i.id))
    .eq('tier', 'department')
    .is('sub_location', null)
  if (error) throw error

  // Key on (item, location) so an item held in two departments resolves to the
  // one its catalogue row names — the same coalesce apply_stock_delta performs.
  const byItemAndLocation = new Map()
  for (const r of (data ?? [])) {
    byItemAndLocation.set(`${r.stock_item_id}|${r.location}`, Number(r.quantity))
  }
  for (const item of list) {
    out.set(item.id, byItemAndLocation.get(`${item.id}|${item.department}`) ?? 0)
  }
  return out
}

/**
 * Move stock from one location to another — the two-tier issue path.
 * Primary case is MAIN_STORE -> a department: the store balance is deducted
 * and the department balance credited, atomically (migration 055).
 *
 * Fail-closed: if the source cannot cover the FULL quantity the call is
 * rejected and nothing moves. There is no partial issue.
 *
 * Returns { from_location, to_location, quantity, from_quantity, to_quantity }.
 */
export async function issueStock(stockItemId, fromLocation, toLocation, quantity, {
  movementType = 'issue',
  reason = null,
  fromSubLocation = null,
  toSubLocation = null,
} = {}) {
  if (!MOVEMENT_TYPES.includes(movementType)) {
    throw new Error(`issueStock: movementType must be one of ${MOVEMENT_TYPES.join(', ')}`)
  }
  const { data, error } = await supabase.rpc('issue_stock', {
    p_stock_item_id:     stockItemId,
    p_from_location:     fromLocation,
    p_to_location:       toLocation,
    p_quantity:          quantity,
    p_reason:            reason,
    p_movement_type:     movementType,
    p_from_sub_location: fromSubLocation,
    p_to_sub_location:   toSubLocation,
  })
  if (error) throw error
  return data
}

/**
 * Move stock between two locations from the Transfers screen (migration 057).
 *
 * Thin wrapper over transfer_stock, which is itself a thin delegation to
 * issue_stock — one transaction, deterministic lock order, fail-closed on
 * insufficient source, destination row created at the right location/tier if
 * absent. None of that is reimplemented anywhere.
 *
 * There is deliberately NO movementType option. The server derives it from the
 * movement: 'issue' when either end is MAIN_STORE, 'transfer' otherwise. If the
 * caller could choose, a manual store→department move would be recorded as
 * 'transfer' while the identical movement raised through a requisition was
 * recorded as 'issue', and the Movement Ledger would describe one physical
 * event two ways. The returned object reports which type was actually written.
 *
 * Returns { from_location, to_location, quantity, from_quantity, to_quantity,
 *           movement_type }.
 */
export async function transferStock(stockItemId, fromLocation, toLocation, quantity, {
  reason = null,
  fromSubLocation = null,
  toSubLocation = null,
} = {}) {
  const { data, error } = await supabase.rpc('transfer_stock', {
    p_stock_item_id:     stockItemId,
    p_from_location:     fromLocation,
    p_to_location:       toLocation,
    p_quantity:          quantity,
    p_reason:            reason,
    p_from_sub_location: fromSubLocation,
    p_to_sub_location:   toSubLocation,
  })
  if (error) throw error
  return data
}

/**
 * Post an end-of-day bar count (migration 059).
 *
 * ONE call does the whole cycle, in one transaction:
 *   1. reconciles each counted item's bar balance to what was physically
 *      counted — a stock take, because nothing deducts sales, so the balance
 *      is fiction between counts and the count is the only truth;
 *   2. stamps each line with the pre-count balance, the par in force and the
 *      shortfall, so the document stays faithful after par later changes;
 *   3. raises a PRE-FILLED refill requisition per short item
 *      (source 'par_refill', status 'pending'), tagged with the session;
 *   4. marks the session posted.
 *
 * This is the only way to post a count. The session's own status column is
 * protected by RLS so it cannot be flipped to 'posted' directly — posting and
 * the stock write are deliberately inseparable.
 *
 * SECURITY DEFINER on the database side, gated by an explicit in-function
 * check: owner/admin, or the department_head whose department IS the session's
 * location. That grants exactly "post a count at your own bar" without giving
 * heads the arbitrary balance writes that widening RLS would have.
 *
 * Returns { session_id, location, business_date, lines_counted,
 *           requisitions_raised, units_requested }.
 */
export async function postBarCount(sessionId) {
  const { data, error } = await supabase.rpc('post_bar_count', { p_session_id: sessionId })
  if (error) throw error
  return data
}

/**
 * Fulfil every approved requisition generated by one count, Main Store → bar,
 * in a single transaction (migration 059).
 *
 * SECURITY INVOKER, deliberately: fulfilling is already an owner/admin action
 * under existing RLS and issue_stock is invoker too, so the existing policies
 * stay the only gate and this adds no second privilege surface. It exists to
 * make the loop atomic, not to grant anything.
 *
 * Partial semantics differ from a single requisition on purpose. 055's rule —
 * one requisition is never part-filled — still holds per line. But a 96-line
 * refill must not be abandoned because one item is short in the store, so an
 * insufficient-stock failure on a line is recorded and skipped and the batch
 * continues. Every other error aborts the whole batch. Nothing fails silently:
 * `details` names every skipped line.
 *
 * Returns { session_id, fulfilled, skipped, details }.
 */
export async function fulfilRequisitionBatch(sessionId) {
  const { data, error } = await supabase.rpc('fulfil_requisition_batch', { p_session_id: sessionId })
  if (error) throw error
  return data
}

/**
 * Record a stock draw with its consumption attribution (migration 060).
 *
 * The three dimensions FUNCTIONAL_SPEC §2.3 asks for:
 *   what  — stockItemId + quantity
 *   where — location, subLocation (e.g. Laundry inside Housekeeping), roomId
 *   who   — consumedBy, a STAFF ROSTER id (1 of 62), which is NOT the login
 *           user. The login user is recorded separately server-side as
 *           performed_by. A housekeeper has no login, so both are needed.
 *
 * Quantity is POSITIVE — the amount used. The server applies the sign.
 *
 * SECURITY DEFINER on the database side, gated by an explicit in-function
 * check: owner/admin, or the department_head whose department IS the location.
 * A head may only attribute to their own department's roster. The Main Store is
 * refused: the store issues stock, it does not consume it.
 *
 * The balance write is delegated to apply_stock_delta, so the row lock and the
 * fail-closed insufficient-stock check are the same single implementation every
 * other stock path uses. Never insert a stock_movements row alongside this.
 *
 * Returns { stock_item_id, item, location, sub_location, quantity, room,
 *           consumed_by, new_quantity }.
 */
export async function recordConsumption(stockItemId, location, quantity, {
  subLocation = null,
  roomId      = null,
  consumedBy  = null,
  reason      = null,
} = {}) {
  const { data, error } = await supabase.rpc('record_consumption', {
    p_stock_item_id: stockItemId,
    p_location:      location,
    p_sub_location:  subLocation,
    p_quantity:      quantity,
    p_room_id:       roomId,
    p_consumed_by:   consumedBy,
    p_reason:        reason,
  })
  if (error) throw error
  return data
}

/**
 * Set an item's balance to an absolute value — a stock take. The delta is
 * computed server-side under the lock, so it cannot be based on a stale read.
 * Records an 'adjustment' movement for the difference, and no movement at all
 * when the value is unchanged. Returns the new quantity.
 *
 * Since 059 the movement also carries the department: the sign decides the
 * side (counted down → from_department, counted up → to_department). Before
 * that both were NULL on every adjustment, which made them invisible to the
 * Movement Ledger's department filter — the same fault data-ops/006 fixed for
 * event movements.
 *
 * `location` / `subLocation` are the two-tier coordinates (051). Omitting
 * location makes the server fall back to the item's catalogue department,
 * which is the DEPRECATED location authority — that fallback exists only so
 * pre-051 callers kept working, and it can never resolve to 'Main Store'
 * because the store is not a department. This helper passed neither until
 * 17 August 2026, so the Main Store could not be adjusted at all and every
 * adjustment silently landed on the item's own department tier. Always pass a
 * location.
 */
export async function setStockQuantity(stockItemId, newQty, reason = null, {
  location = null,
  subLocation = null,
} = {}) {
  const { data, error } = await supabase.rpc('set_stock_quantity', {
    p_stock_item_id: stockItemId,
    p_new_qty:       newQty,
    p_reason:        reason,
    p_location:      location,
    p_sub_location:  subLocation,
  })
  if (error) throw error
  return Number(data)
}
