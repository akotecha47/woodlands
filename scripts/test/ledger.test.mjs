// Movement Ledger pair-collapse tests.
//
//   node scripts/test/ledger.test.mjs
//
// Exercises the REAL collapsePairs from src/lib/ledger.js. This exists because
// the pairing rule is the one part of the Ledger that can silently double-count
// or silently hide a real stock movement, and it CANNOT be exercised against
// live data: as of 14 August 2026 production holds no issue or transfer row at
// all (533 opening_balance, 1 delivery, 1 requisition, 1 event_allocation).
// The first real requisition fulfil or transfer will be the first live
// exercise; until then this suite is the proof.
import { collapsePairs, parseSupplier } from '../../src/lib/ledger.js'

let pass = 0, fail = 0
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else      { fail++; console.log(`  FAIL  ${name}${detail ? ' -> ' + JSON.stringify(detail) : ''}`) }
}

const T = '2026-08-14T10:00:00+00:00'
const T2 = '2026-08-14T09:00:00+00:00'

// ── 1. A real issue pair, exactly as issue_stock writes it ──────────────────
console.log('\n1. issue pair (Main Store -> Sports Bar, 10 units)')
{
  const rows = [
    { id: 'a', stock_item_id: 'i1', movement_type: 'issue', quantity_change: -10,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
    { id: 'b', stock_item_id: 'i1', movement_type: 'issue', quantity_change: 10,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
  ]
  const out = collapsePairs(rows)
  check('two legs collapse to ONE line', out.length === 1, out.length)
  check('line is a pair', out[0]?.kind === 'pair')
  check('quantity is the positive magnitude', Number(out[0]?.row.quantity_change) === 10)
  check('From -> To preserved', out[0]?.row.from_department === 'Main Store' && out[0]?.row.to_department === 'Sports Bar')
  check('source leg retained', out[0]?.sourceLeg?.id === 'a')
}

// ── 2. Single-row types are never collapsed ────────────────────────────────
console.log('\n2. single-row types pass through untouched')
{
  const rows = [
    { id: 'd', stock_item_id: 'i1', movement_type: 'delivery', quantity_change: 10, created_at: T },
    { id: 'e', stock_item_id: 'i1', movement_type: 'event_allocation', quantity_change: -10, created_at: T },
    { id: 'f', stock_item_id: 'i1', movement_type: 'event_return', quantity_change: 4, created_at: T },
    { id: 'g', stock_item_id: 'i1', movement_type: 'adjustment', quantity_change: -1, created_at: T },
    { id: 'h', stock_item_id: 'i1', movement_type: 'opening_balance', quantity_change: 100, created_at: T },
  ]
  const out = collapsePairs(rows)
  check('all five survive as singles', out.length === 5 && out.every(e => e.kind === 'single'), out.length)
  check('an event_allocation and an event_return on the same item do NOT pair',
        out.filter(e => e.row.movement_type.startsWith('event')).length === 2)
  check('signs preserved', out.find(e => e.key === 'e')?.row.quantity_change === -10)
}

// ── 3. Two DIFFERENT items in one transaction must not cross-pair ──────────
console.log('\n3. two items, one transaction')
{
  const rows = [
    { id: 'a', stock_item_id: 'i1', movement_type: 'issue', quantity_change: -5,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
    { id: 'b', stock_item_id: 'i1', movement_type: 'issue', quantity_change: 5,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
    { id: 'c', stock_item_id: 'i2', movement_type: 'issue', quantity_change: -7,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
    { id: 'd', stock_item_id: 'i2', movement_type: 'issue', quantity_change: 7,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
  ]
  const out = collapsePairs(rows)
  check('4 rows -> 2 lines', out.length === 2, out.length)
  check('quantities stay with their own item',
        out.every(e => (e.row.stock_item_id === 'i1' && e.row.quantity_change === 5) ||
                       (e.row.stock_item_id === 'i2' && e.row.quantity_change === 7)))
}

// ── 4. Opposite directions must not collapse into each other ───────────────
console.log('\n4. issue out and issue back, same item, same timestamp')
{
  const rows = [
    { id: 'a', stock_item_id: 'i1', movement_type: 'issue', quantity_change: -5,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
    { id: 'b', stock_item_id: 'i1', movement_type: 'issue', quantity_change: 5,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
    { id: 'c', stock_item_id: 'i1', movement_type: 'issue', quantity_change: -5,
      from_department: 'Sports Bar', to_department: 'Main Store', created_at: T },
    { id: 'd', stock_item_id: 'i1', movement_type: 'issue', quantity_change: 5,
      from_department: 'Sports Bar', to_department: 'Main Store', created_at: T },
  ]
  const out = collapsePairs(rows)
  check('4 rows -> 2 lines', out.length === 2, out.length)
  check('the two directions stay distinct',
        new Set(out.map(e => `${e.row.from_department}->${e.row.to_department}`)).size === 2)
}

// ── 5. THE KNOWN EDGE: same item, same route, twice in one transaction ─────
console.log('\n5. KNOWN EDGE - same item, same route, two moves, one transaction')
{
  const rows = [
    { id: 'a', stock_item_id: 'i1', movement_type: 'issue', quantity_change: -5,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
    { id: 'b', stock_item_id: 'i1', movement_type: 'issue', quantity_change: 5,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
    { id: 'c', stock_item_id: 'i1', movement_type: 'issue', quantity_change: -3,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
    { id: 'd', stock_item_id: 'i1', movement_type: 'issue', quantity_change: 3,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
  ]
  const out = collapsePairs(rows)
  check('4 rows -> 2 lines (no double count, nothing hidden)', out.length === 2, out.length)
  check('magnitude sort keeps 3 with 3 and 5 with 5',
        out.some(e => e.row.quantity_change === 3 && e.sourceLeg.quantity_change === -3) &&
        out.some(e => e.row.quantity_change === 5 && e.sourceLeg.quantity_change === -5))
  check('total moved is still 8', out.reduce((s, e) => s + e.row.quantity_change, 0) === 8)
}

// ── 6. An orphan leg must never be swallowed ───────────────────────────────
console.log('\n6. unmatched leg (malformed ledger) must still render')
{
  const rows = [
    { id: 'a', stock_item_id: 'i1', movement_type: 'transfer', quantity_change: -5,
      from_department: 'Main Bar', to_department: 'Sports Bar', created_at: T },
  ]
  const out = collapsePairs(rows)
  check('orphan survives as a single', out.length === 1 && out[0].kind === 'single')
  check('orphan keeps its negative sign', out[0].row.quantity_change === -5)
}

// ── 7. Ordering ────────────────────────────────────────────────────────────
console.log('\n7. newest first')
{
  const rows = [
    { id: 'old', stock_item_id: 'i1', movement_type: 'delivery', quantity_change: 1, created_at: T2 },
    { id: 'a', stock_item_id: 'i1', movement_type: 'issue', quantity_change: -5,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
    { id: 'b', stock_item_id: 'i1', movement_type: 'issue', quantity_change: 5,
      from_department: 'Main Store', to_department: 'Sports Bar', created_at: T },
  ]
  const out = collapsePairs(rows)
  check('newest entry first', out[0].row.created_at === T, out.map(e => e.row.created_at))
  check('older delivery last', out[out.length - 1].key === 'old')
}

// ── 8. Supplier parsing, as the live delivery row stores it ────────────────
console.log('\n8. supplier parsing')
{
  check('parses the live format', parseSupplier('Supplier: Aman\nReceived by: Owner') === 'Aman')
  check('null when absent', parseSupplier('11') === null)
  check('null when notes empty', parseSupplier(null) === null)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
