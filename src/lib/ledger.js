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
export const PAIRED_TYPES = new Set(['issue', 'transfer'])

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
