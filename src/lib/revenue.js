/**
 * Events revenue computation.
 *
 * Pure functions, no React and no Supabase, so the three readings can be tested
 * on their own. They exist because "revenue should be different in Events"
 * (Dhiren, 27 July 2026) was never made specific — three readings are supported
 * and the choice is HIS, on his return (28 August). Nothing here picks one; the
 * UI defaults to `received` and says on screen that the default is provisional.
 *
 * The three readings, and why each is a distinct number:
 *
 *   received     Cash actually in the till. Payments net of refunds and
 *                reversals, on payment_date. Ignores the bill entirely — an
 *                event billed 1.8m that has paid 300k has recognised 300k.
 *
 *   net_of_cost  Bill revenue minus the cost of stock the event consumed.
 *                NOTE: as of 18 August 2026 the system records NO cost for
 *                stock, at all. `deliveries.unit_cost` is the only cost column
 *                in the schema, and that table is vestigial — it holds zero
 *                rows, RLS is enabled on it with ZERO policies (so no
 *                authenticated role can even read it), and no code path writes
 *                it: a delivery is recorded as a `stock_movements` row with
 *                movement_type='delivery', and stock_movements has no cost
 *                column. So this reading reports its own coverage rather than
 *                silently showing a 100% margin, which is the failure mode that
 *                makes a placeholder screen look like a finding. The machinery
 *                below is complete and tested, ready for whenever a cost source
 *                exists; it is the DATA that is absent, not the calculation.
 *
 *   by_line      The bill decomposed by category. Answers "what did we sell",
 *                not "what did we collect".
 *
 * Refunds are stored POSITIVE with payment_type = 'refund' (event_payments
 * carries CHECK (amount > 0), so a negative row is impossible) and subtracted
 * here. Reversals will be stored the same way when migration 062 lands; they
 * are already handled so the revenue figures do not need re-touching then.
 */

// ── readings ────────────────────────────────────────────────────

export const REVENUE_READINGS = [
  {
    value: 'received',
    label: 'Cash Received',
    blurb: 'Recognised when payment is received, net of refunds and reversals.',
  },
  {
    value: 'net_of_cost',
    label: 'Net of Cost',
    blurb: 'Bill revenue less the cost of stock the event consumed.',
  },
  {
    value: 'by_line',
    label: 'By Line',
    blurb: 'The bill broken down by category.',
  },
]

// Provisional. Dhiren has not chosen a reading; `received` is the one that
// stays correct whichever he picks, because it makes no claim about cost or
// about work not yet billed.
export const DEFAULT_READING = 'received'

export const REVENUE_READING_KEY = 'woodlands.events.revenueReading'

export function isReading(v) {
  return REVENUE_READINGS.some(r => r.value === v)
}

// Payment types that REDUCE recognised revenue. Both are stored positive.
// 'refund' — money went back to the client.
// 'reversal' — the entry was wrong; the money never came in (migration 062).
export const NEGATIVE_PAY_TYPES = new Set(['refund', 'reversal'])

// ── payments ────────────────────────────────────────────────────

/**
 * Split a payment set into its three components.
 *
 * `gross` is everything that is not a refund or a reversal — including the
 * original of a reversed entry, which is why `reversed` is subtracted rather
 * than the original being filtered out. Filtering the original would require
 * knowing which payment a reversal points at; subtracting does not, so this
 * function stays correct both before and after 062.
 */
export function summarisePayments(payments = []) {
  let gross = 0, refunded = 0, reversed = 0

  for (const p of payments) {
    const amt = Number(p.amount) || 0
    if (p.payment_type === 'refund')        refunded += amt
    else if (p.payment_type === 'reversal') reversed += amt
    else                                    gross    += amt
  }

  return { gross, refunded, reversed, net: gross - refunded - reversed }
}

// ── bill ────────────────────────────────────────────────────────

export function billTotal(items = []) {
  return items.reduce((s, i) => s + (Number(i.amount) || 0), 0)
}

/**
 * The bill grouped by category, largest first, each with its share of the
 * total. `pct` is 0 for every line when the bill is empty rather than NaN.
 */
export function byCategory(items = []) {
  const total = billTotal(items)
  const map = new Map()

  for (const i of items) {
    const cat = i.category || 'Uncategorised'
    const cur = map.get(cat) ?? { category: cat, amount: 0, count: 0 }
    cur.amount += Number(i.amount) || 0
    cur.count  += 1
    map.set(cat, cur)
  }

  return [...map.values()]
    .map(l => ({ ...l, pct: total > 0 ? (l.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category))
}

// ── cost ────────────────────────────────────────────────────────

/**
 * Weighted-average unit cost per stock item, derived from deliveries.
 *
 * Weighted by quantity, not a plain mean over deliveries: two units at 100 and
 * ten units at 50 is a 58.33 average cost, not 75. Rows with no unit_cost or a
 * non-positive quantity contribute nothing — an unpriced delivery is not a
 * delivery at zero cost, and treating it as one is how a margin becomes 100%
 * by accident.
 */
export function unitCostIndex(deliveries = []) {
  const acc = new Map()

  for (const d of deliveries) {
    const qty  = Number(d.quantity)
    const cost = d.unit_cost === null || d.unit_cost === undefined ? null : Number(d.unit_cost)
    if (!d.item_id || !(qty > 0) || cost === null || Number.isNaN(cost)) continue

    const cur = acc.get(d.item_id) ?? { qty: 0, value: 0 }
    cur.qty   += qty
    cur.value += qty * cost
    acc.set(d.item_id, cur)
  }

  const out = new Map()
  for (const [id, { qty, value }] of acc) out.set(id, value / qty)
  return out
}

/**
 * What the event's stock actually cost, and how much of it could be priced.
 *
 * Consumed quantity is `deducted_qty - returned_qty` — what left the store and
 * did not come back. `allocated_qty` is an intention, not a consumption, so it
 * is deliberately not used.
 *
 * Returns `complete: false` whenever any consuming line has no unit cost, so
 * the caller can refuse to present a margin it cannot stand behind. An event
 * that consumed nothing is `complete: true` with zero cost — that is a real
 * answer, not a missing one.
 */
export function allocationCost(allocations = [], costIndex = new Map()) {
  let cost = 0, priced = 0, unpriced = 0, consumedUnits = 0

  for (const a of allocations) {
    const consumed = (Number(a.deducted_qty) || 0) - (Number(a.returned_qty) || 0)
    if (consumed <= 0) continue

    consumedUnits += consumed
    const unit = costIndex.get(a.stock_item_id)
    if (unit === undefined) { unpriced += 1; continue }
    priced += 1
    cost   += consumed * unit
  }

  return { cost, priced, unpriced, consumedUnits, complete: unpriced === 0 }
}

// ── the three readings ──────────────────────────────────────────

/**
 * Compute one reading over one event's data.
 *
 * Every reading returns the same envelope — `{ reading, headline, headlineLabel,
 * available, lines, detail }` — so the UI renders one shape and cannot drift a
 * layout per reading. `available: false` means the number cannot honestly be
 * produced; `detail.reason` says why, and the caller must show that instead of
 * a figure.
 */
export function computeRevenue(reading, { payments = [], billItems = [], allocations = [], costIndex = new Map() } = {}) {
  const pay   = summarisePayments(payments)
  const bill  = billTotal(billItems)

  if (reading === 'by_line') {
    const lines = byCategory(billItems)
    return {
      reading, available: billItems.length > 0,
      headline: bill, headlineLabel: 'Billed',
      lines,
      detail: {
        reason: billItems.length > 0 ? null : 'No bill items have been added to this event yet.',
        collected: pay.net,
        outstanding: bill - pay.net,
      },
    }
  }

  if (reading === 'net_of_cost') {
    const c = allocationCost(allocations, costIndex)
    // The margin is withheld, not estimated, when any consumed line is
    // unpriced. A partial cost understates cost and overstates margin, and it
    // does so silently — the one outcome worse than showing nothing.
    const available = c.complete
    return {
      reading, available,
      headline: available ? bill - c.cost : null,
      headlineLabel: 'Net of Cost',
      lines: [],
      detail: {
        reason: available ? null
          : `${c.unpriced} of ${c.priced + c.unpriced} consumed stock lines have no unit cost, so a margin cannot be computed without understating cost.`,
        // True when NOTHING could be priced, which today means the system holds
        // no cost source at all rather than a few unpriced items. The caller
        // shows a different, fuller explanation for that case, because "we are
        // missing two prices" and "we record no prices" are different problems.
        costSourceMissing: !available && c.priced === 0,
        billed: bill,
        cost: available ? c.cost : null,
        marginPct: available && bill > 0 ? ((bill - c.cost) / bill) * 100 : null,
        priced: c.priced,
        unpriced: c.unpriced,
        consumedUnits: c.consumedUnits,
      },
    }
  }

  // 'received' — the default, and the fallback for an unknown reading rather
  // than a blank panel.
  return {
    reading: 'received', available: true,
    headline: pay.net, headlineLabel: 'Recognised',
    lines: [],
    detail: {
      reason: null,
      gross: pay.gross,
      refunded: pay.refunded,
      reversed: pay.reversed,
      billed: bill,
      outstanding: bill - pay.net,
    },
  }
}

/**
 * The same three readings across many events, for the Events List strip.
 *
 * `events` is only used for its ids and for the date filter the caller has
 * already applied; payments and bill items are passed whole and bucketed here.
 * Rows belonging to no event in the set are ignored, so a caller may pass the
 * full tables without pre-filtering.
 */
export function computePortfolioRevenue(reading, { events = [], payments = [], billItems = [], allocations = [], costIndex = new Map() } = {}) {
  const ids = new Set(events.map(e => e.id))
  const keep = rows => rows.filter(r => ids.has(r.event_id))

  return computeRevenue(reading, {
    payments: keep(payments),
    billItems: keep(billItems),
    allocations: keep(allocations),
    costIndex,
  })
}
