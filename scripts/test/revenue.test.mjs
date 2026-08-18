// Events revenue reading tests.
//
//   node scripts/test/revenue.test.mjs
//
// Exercises the REAL functions from src/lib/revenue.js. This exists because the
// three readings cannot be exercised against live data in any useful way: as of
// 18 August 2026 production holds ONE event, five payments, four bill items and
// ZERO deliveries — so the net-of-cost path in particular has no live input at
// all, and the one thing it must never do (report a 100% margin when cost is
// simply missing) is only provable here.
//
// The reversal cases run BEFORE migration 062 exists. That is deliberate: the
// revenue figures must already be right on the day reversals start being
// written, not fixed afterwards.
import {
  summarisePayments, billTotal, byCategory, unitCostIndex, allocationCost,
  computeRevenue, computePortfolioRevenue, isReading, DEFAULT_READING,
} from '../../src/lib/revenue.js'

let pass = 0, fail = 0
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else      { fail++; console.log(`  FAIL  ${name}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`) }
}

// Production's actual five payments (18 August 2026), so the suite is anchored
// to real data and not only to invented rows.
const LIVE_PAYMENTS = [
  { payment_type: 'deposit',    amount: 300000 },
  { payment_type: 'balance',    amount: 60000  },
  { payment_type: 'balance',    amount: 40000  },
  { payment_type: 'additional', amount: 1000000 },
  { payment_type: 'refund',     amount: 100000 },
]

// Production's actual four bill items.
const LIVE_BILL = [
  { category: 'Venue Hire',    amount: 350000  },
  { category: 'Catering',      amount: 380000  },
  { category: 'Beverages',     amount: 70000   },
  { category: 'Equipment & AV', amount: 1000000 },
]

// ── 1. Payment netting ─────────────────────────────────────────────────────
console.log('\n1. summarisePayments')
{
  const s = summarisePayments(LIVE_PAYMENTS)
  check('gross excludes the refund', s.gross === 1400000, s.gross)
  check('refunded picked out', s.refunded === 100000, s.refunded)
  check('nothing reversed yet', s.reversed === 0, s.reversed)
  check('net = gross - refunded', s.net === 1300000, s.net)

  const empty = summarisePayments([])
  check('empty set is all zero', empty.net === 0 && empty.gross === 0)
  check('undefined input does not throw', summarisePayments().net === 0)
}

// ── 2. Reversals reduce revenue, and the original is NOT filtered ──────────
console.log('\n2. reversals (migration 062, handled ahead of time)')
{
  // A 500,000 deposit keyed by mistake, reversed, then re-entered at 50,000.
  const rows = [
    { payment_type: 'deposit',  amount: 500000 },
    { payment_type: 'reversal', amount: 500000 },
    { payment_type: 'deposit',  amount: 50000  },
  ]
  const s = summarisePayments(rows)
  check('gross still counts the mis-keyed original', s.gross === 550000, s.gross)
  check('reversed reported separately', s.reversed === 500000, s.reversed)
  check('net is the corrected figure', s.net === 50000, s.net)

  const r = computeRevenue('received', { payments: rows })
  check('received reading nets the reversal', r.headline === 50000, r.headline)
  check('reversed surfaced in detail', r.detail.reversed === 500000)
}
{
  // A refund and a reversal in the same set are both subtracted but never
  // conflated — they mean different things and are reported separately.
  const s = summarisePayments([
    { payment_type: 'balance',  amount: 200000 },
    { payment_type: 'refund',   amount: 30000  },
    { payment_type: 'reversal', amount: 20000  },
  ])
  check('refund and reversal both subtract', s.net === 150000, s.net)
  check('refund and reversal not conflated', s.refunded === 30000 && s.reversed === 20000)
}

// ── 3. Bill totals and category breakdown ─────────────────────────────────
console.log('\n3. bill')
{
  check('live bill totals 1,800,000', billTotal(LIVE_BILL) === 1800000, billTotal(LIVE_BILL))
  check('empty bill is 0, not NaN', billTotal([]) === 0)

  const lines = byCategory(LIVE_BILL)
  check('one line per category', lines.length === 4, lines.length)
  check('largest first', lines[0].category === 'Equipment & AV', lines[0].category)
  check('percentages sum to 100', Math.abs(lines.reduce((s, l) => s + l.pct, 0) - 100) < 1e-9)

  const merged = byCategory([
    { category: 'Catering', amount: 100 },
    { category: 'Catering', amount: 300 },
  ])
  check('same category merges', merged.length === 1 && merged[0].amount === 400, merged)
  check('merged line counts its items', merged[0].count === 2)

  const blank = byCategory([{ category: null, amount: 50 }])
  check('a null category is labelled, not dropped', blank[0].category === 'Uncategorised')
  check('empty bill gives no NaN pct', byCategory([]).length === 0)
}

// ── 4. Unit cost is weighted by quantity ──────────────────────────────────
console.log('\n4. unitCostIndex')
{
  const idx = unitCostIndex([
    { item_id: 'i1', quantity: 2,  unit_cost: 100 },
    { item_id: 'i1', quantity: 10, unit_cost: 50  },
  ])
  // A plain mean over the two deliveries says 75. Weighted by quantity it is
  // (2*100 + 10*50) / 12 = 58.33, because most of the stock came in cheap.
  check('weighted, not a plain mean', Math.abs(idx.get('i1') - 700 / 12) < 1e-9, idx.get('i1'))

  const skipped = unitCostIndex([
    { item_id: 'i2', quantity: 5, unit_cost: null },
    { item_id: 'i3', quantity: 0, unit_cost: 100 },
    { item_id: null, quantity: 5, unit_cost: 100 },
  ])
  check('an unpriced delivery is not a zero-cost delivery', !skipped.has('i2'))
  check('a zero-quantity delivery is ignored', !skipped.has('i3'))
  check('a delivery with no item is ignored', skipped.size === 0, skipped.size)
  check('production has zero deliveries -> empty index', unitCostIndex([]).size === 0)
}

// ── 5. Allocation cost uses consumed, not allocated ───────────────────────
console.log('\n5. allocationCost')
{
  const idx = new Map([['i1', 10]])
  const c = allocationCost([
    { stock_item_id: 'i1', allocated_qty: 100, deducted_qty: 10, returned_qty: 4 },
  ], idx)
  check('consumed = deducted - returned', c.consumedUnits === 6, c.consumedUnits)
  check('allocated_qty is NOT used', c.cost === 60, c.cost)
  check('fully priced', c.complete === true && c.unpriced === 0)

  const none = allocationCost([
    { stock_item_id: 'i1', deducted_qty: 5, returned_qty: 5 },
  ], idx)
  check('a fully returned allocation consumes nothing', none.consumedUnits === 0 && none.cost === 0)
  check('consuming nothing is complete, not missing', none.complete === true)

  const partial = allocationCost([
    { stock_item_id: 'i1', deducted_qty: 10, returned_qty: 0 },
    { stock_item_id: 'i2', deducted_qty: 10, returned_qty: 0 },
  ], idx)
  check('an unpriced consumed line is counted', partial.unpriced === 1, partial.unpriced)
  check('partial pricing is NOT complete', partial.complete === false)
}

// ── 6. net_of_cost REFUSES to show a margin it cannot stand behind ────────
console.log('\n6. net_of_cost with no cost data (production, today)')
{
  // The exact live shape: two deducted allocations, zero deliveries.
  const r = computeRevenue('net_of_cost', {
    billItems: LIVE_BILL,
    allocations: [
      { stock_item_id: 'b80cfb53', deducted_qty: 10, returned_qty: 0 },
      { stock_item_id: '920f73fd', deducted_qty: 13, returned_qty: 0 },
    ],
    costIndex: unitCostIndex([]),
  })
  check('reading is unavailable', r.available === false)
  check('NO headline figure is invented', r.headline === null, r.headline)
  check('NO 100% margin is shown', r.detail.marginPct === null, r.detail.marginPct)
  check('cost is withheld, not zero', r.detail.cost === null, r.detail.cost)
  check('reason says a margin cannot be computed', /margin cannot be computed/.test(r.detail.reason), r.detail.reason)
  check('flagged as NO cost source, not a few gaps', r.detail.costSourceMissing === true)
  check('billed side is still reported', r.detail.billed === 1800000)
  check('both consumed lines counted as unpriced', r.detail.unpriced === 2, r.detail.unpriced)
}
{
  // Same reading, once cost data exists.
  const idx = unitCostIndex([
    { item_id: 'x', quantity: 100, unit_cost: 2000 },
  ])
  const r = computeRevenue('net_of_cost', {
    billItems: LIVE_BILL,
    allocations: [{ stock_item_id: 'x', deducted_qty: 10, returned_qty: 2 }],
    costIndex: idx,
  })
  check('available once every line is priced', r.available === true)
  check('headline = billed - cost', r.headline === 1800000 - 16000, r.headline)
  check('margin computed', Math.abs(r.detail.marginPct - ((1800000 - 16000) / 1800000) * 100) < 1e-9)
}
{
  // An event that drew no stock: a real zero, not a gap.
  const r = computeRevenue('net_of_cost', { billItems: LIVE_BILL, allocations: [] })
  check('no stock drawn is available', r.available === true)
  check('headline equals the bill', r.headline === 1800000, r.headline)
}
{
  // Partial pricing: SOME lines priced, some not. Distinct from "no cost source
  // at all", because the two need different words on screen.
  const r = computeRevenue('net_of_cost', {
    billItems: LIVE_BILL,
    allocations: [
      { stock_item_id: 'x', deducted_qty: 5, returned_qty: 0 },
      { stock_item_id: 'y', deducted_qty: 5, returned_qty: 0 },
    ],
    costIndex: unitCostIndex([{ item_id: 'x', quantity: 10, unit_cost: 100 }]),
  })
  check('partial pricing is still unavailable', r.available === false)
  check('partial pricing is NOT a missing cost source', r.detail.costSourceMissing === false)
  check('reason counts the unpriced lines', /1 of 2/.test(r.detail.reason), r.detail.reason)
}

// ── 7. received and by_line over the live data ────────────────────────────
console.log('\n7. readings over production data')
{
  const r = computeRevenue('received', { payments: LIVE_PAYMENTS, billItems: LIVE_BILL })
  check('recognised = 1,300,000', r.headline === 1300000, r.headline)
  check('outstanding = billed - recognised', r.detail.outstanding === 500000, r.detail.outstanding)
  check('always available', r.available === true)

  const l = computeRevenue('by_line', { payments: LIVE_PAYMENTS, billItems: LIVE_BILL })
  check('by_line headline is the bill', l.headline === 1800000, l.headline)
  check('by_line carries the lines', l.lines.length === 4)
  check('by_line reports what was collected', l.detail.collected === 1300000)

  const emptyBill = computeRevenue('by_line', { billItems: [] })
  check('an empty bill is unavailable, with a reason', emptyBill.available === false && !!emptyBill.detail.reason)
}

// ── 8. The three readings genuinely differ ────────────────────────────────
console.log('\n8. the readings are three different numbers')
{
  const input = {
    payments: LIVE_PAYMENTS,
    billItems: LIVE_BILL,
    allocations: [{ stock_item_id: 'x', deducted_qty: 10, returned_qty: 0 }],
    costIndex: unitCostIndex([{ item_id: 'x', quantity: 50, unit_cost: 3000 }]),
  }
  const a = computeRevenue('received',    input).headline
  const b = computeRevenue('net_of_cost', input).headline
  const c = computeRevenue('by_line',     input).headline
  check('received != net_of_cost', a !== b, { a, b })
  check('net_of_cost != by_line',  b !== c, { b, c })
  check('received != by_line',     a !== c, { a, c })
}

// ── 9. Unknown reading falls back rather than blanking ────────────────────
console.log('\n9. guards')
{
  const r = computeRevenue('something_dhiren_asked_for_later', { payments: LIVE_PAYMENTS })
  check('unknown reading falls back to received', r.reading === 'received' && r.headline === 1300000)
  check('computeRevenue with no input does not throw', computeRevenue('received').headline === 0)
  check('isReading accepts the three', ['received', 'net_of_cost', 'by_line'].every(isReading))
  check('isReading rejects junk', !isReading('profit') && !isReading(null))
  check('default is received', DEFAULT_READING === 'received')
}

// ── 10. Portfolio aggregation buckets by event ────────────────────────────
console.log('\n10. computePortfolioRevenue')
{
  const events = [{ id: 'e1' }, { id: 'e2' }]
  const payments = [
    { event_id: 'e1', payment_type: 'deposit', amount: 100 },
    { event_id: 'e2', payment_type: 'balance', amount: 200 },
    { event_id: 'e3', payment_type: 'balance', amount: 999 },   // not in the set
  ]
  const r = computePortfolioRevenue('received', { events, payments })
  check('sums across the events in the set', r.headline === 300, r.headline)
  check('an event outside the set is ignored', r.headline !== 1299)

  const none = computePortfolioRevenue('received', { events: [], payments })
  check('an empty event set is 0, not everything', none.headline === 0, none.headline)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
