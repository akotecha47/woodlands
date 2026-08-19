/**
 * Movement Ledger presentation logic.
 *
 * Pure functions, no React and no Supabase, so the pairing rule can be tested
 * on its own — it is the one piece of the Ledger that can silently double-count
 * or silently hide a real movement, and it cannot be exercised from the live
 * data until an issue or transfer actually happens.
 */

// issue_stock/transfer_stock write a MATCHED PAIR through apply_stock_delta:
// one negative leg at the source and one positive leg at the destination,
// sharing stock_item_id, movement_type, from_department, to_department and
// created_at (now() is transaction-constant). Both are true rows; showing them
// separately would read as two events and as a double count.
//
// 'requisition' is here for the same reason: issue_stock writes both legs with
// the CALLER's p_movement_type, and requisition fulfil (and
// fulfil_requisition_batch) pass 'requisition' rather than 'issue'. Those pairs
// are structurally identical to an issue pair — same item, same type, same
// from/to, same created_at — so they collapse by the same rule. AUDIT_3 C-07,
// decision D-1(a): the DISPLAY is corrected, the 188 live rows are left exactly
// as written. Re-typing them to 'issue' would also change what the Requisition
// type filter shows, and is a data-op, not this.
export const PAIRED_TYPES = new Set(['issue', 'transfer', 'requisition'])

/**
 * Collapse the ±legs of issue/transfer movements into one line each.
 *
 * Returns entries of { key, kind: 'pair' | 'single', row, sourceLeg? },
 * newest first. For a pair, `row` is the POSITIVE (destination) leg, so the
 * displayed quantity is the magnitude moved.
 *
 * KNOWN EDGE, accepted for now: if the SAME item moves the SAME way TWICE in
 * ONE transaction, the group holds 4 rows and legs are paired by magnitude
 * rather than by identity — two moves of equal size in one transaction could be
 * paired across each other. Both lines still render, with correct quantities
 * and correct From → To, so nothing is lost or double-counted; only the
 * (invisible) attribution of leg to leg could swap. The real fix is a
 * movement_group id written by apply_stock_delta, which would change that
 * function's signature — deliberately out of scope.
 *
 * Unmatched legs are never dropped. Anything that fails to pair falls through
 * as a single row, so a malformed ledger shows itself rather than hiding.
 */
export function collapsePairs(rows) {
  const out = []
  const groups = new Map()

  for (const r of rows) {
    if (!PAIRED_TYPES.has(r.movement_type)) {
      out.push({ key: r.id, kind: 'single', row: r })
      continue
    }
    const k = [
      r.stock_item_id, r.movement_type, r.created_at,
      r.from_department ?? '', r.to_department ?? '',
    ].join('|')
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }

  for (const rs of groups.values()) {
    const byMagnitude = (a, b) => Math.abs(a.quantity_change) - Math.abs(b.quantity_change)
    const negs = rs.filter(r => Number(r.quantity_change) < 0).sort(byMagnitude)
    const poss = rs.filter(r => Number(r.quantity_change) > 0).sort(byMagnitude)
    const paired = Math.min(negs.length, poss.length)

    for (let i = 0; i < paired; i++) {
      out.push({ key: poss[i].id, kind: 'pair', row: poss[i], sourceLeg: negs[i] })
    }
    for (let i = paired; i < negs.length; i++) out.push({ key: negs[i].id, kind: 'single', row: negs[i] })
    for (let i = paired; i < poss.length; i++) out.push({ key: poss[i].id, kind: 'single', row: poss[i] })
  }

  return out.sort((a, b) => new Date(b.row.created_at) - new Date(a.row.created_at))
}

/** Deliveries record their supplier in the notes; there is no supplier column. */
export function parseSupplier(notes) {
  if (!notes) return null
  const match = notes.match(/^Supplier:\s*(.+)/m)
  return match ? match[1].trim() : null
}

// Movements with no departmental route at all. A delivery is external inflow —
// it arrives from a supplier, which is not a department and does not belong in
// a column meaning "which departments did this move between". An
// opening_balance is an import artefact and moved between nowhere.
export const NO_ROUTE_TYPES = new Set(['delivery', 'opening_balance'])

/**
 * What the From → To cell should show for a movement.
 *
 * Returns null when the movement has no route, which the caller renders as an
 * em dash. This previously put the supplier parsed out of the notes in the From
 * slot for deliveries, which rendered "Aman → —" on the live delivery row: a
 * person's name sitting where a department belongs, reading as though stock had
 * arrived from a department called Aman. The supplier is still on the row and
 * is surfaced as a tooltip — it is simply not a route.
 *
 * Render-side only. No delivery row's from_department is mutated; as of the
 * 14 August backfill every delivery and opening_balance row already carries
 * NULL in both department columns.
 */
export function routeFor(row) {
  if (NO_ROUTE_TYPES.has(row.movement_type)) return null
  const from = row.from_department ?? null
  const to   = row.to_department ?? null
  if (!from && !to) return null
  return { from, to }
}
