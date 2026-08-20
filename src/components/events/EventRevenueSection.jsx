import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { computeRevenue, REVENUE_READINGS } from '../../lib/revenue'
import {
  fmtMWK, useRevenueReading, RevenueReadingPicker, ProvisionalRevenueNote,
} from './EventsUI'

/**
 * Per-event revenue, under whichever of the three readings is selected.
 *
 * Loads its own payments and allocations rather than taking them from
 * EventDetailTab, matching every other section on the page. Bill items come in
 * as a prop because the detail tab already holds them for the header.
 *
 * There is no write path here at all — this section only ever reads.
 */
export default function EventRevenueSection({ eventId, billItems = [] }) {
  const [reading, setReading] = useRevenueReading()
  const [payments,    setPayments]    = useState([])
  const [allocations, setAllocations] = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      // No cost query. `deliveries.unit_cost` is the only cost column in the
      // schema and that table is unreachable AND unused — RLS is enabled on it
      // with zero policies, it holds zero rows, and nothing in the app reads or
      // writes it (a delivery is a stock_movements row). Querying it would
      // return [] for a reason that has nothing to do with cost, which is
      // exactly the silently-empty read this codebase has been bitten by
      // before. So net_of_cost is computed with no cost index and reports that
      // honestly. Wire a real source in here when one exists — the computation
      // is already written and tested (unitCostIndex/allocationCost).
      const [payR, allocR] = await Promise.all([
        supabase.from('event_payments')
          .select('amount, payment_type, payment_date').eq('event_id', eventId),
        supabase.from('event_stock_allocations')
          .select('stock_item_id, allocated_qty, deducted_qty, returned_qty')
          .eq('event_id', eventId),
      ])
      if (cancelled) return
      setPayments(payR.data ?? [])
      setAllocations(allocR.data ?? [])
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [eventId])

  const r = computeRevenue(reading, { payments, billItems, allocations })
  const cfg = REVENUE_READINGS.find(x => x.value === r.reading)

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h3 className="text-sm font-bold text-navy">Revenue</h3>
          <p className="text-xs text-gray-500 mt-0.5">{cfg?.blurb}</p>
        </div>
        <RevenueReadingPicker reading={r.reading} onChange={setReading} />
      </div>

      <ProvisionalRevenueNote className="mb-4" />

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="border border-line rounded-xl p-5">
          {/* Headline — or, where the reading cannot honestly produce one, the
              reason instead. Never a fallback zero. */}
          {r.available ? (
            <>
              <p className="text-xs text-gray-500 mb-1">{r.headlineLabel}</p>
              <p className="text-2xl font-bold text-gray-900">{fmtMWK(r.headline)}</p>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-1">{r.headlineLabel}</p>
              <p className="text-2xl font-bold text-gray-300">—</p>
              <p className="text-xs text-gray-600 mt-2 max-w-prose">{r.detail.reason}</p>
            </>
          )}

          {r.reading === 'received'    && <ReceivedDetail d={r.detail} />}
          {r.reading === 'net_of_cost' && <NetOfCostDetail d={r.detail} available={r.available} />}
          {r.reading === 'by_line'     && <ByLineDetail lines={r.lines} d={r.detail} total={r.headline} />}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, tone = 'gray', hint }) {
  const toneCls = {
    gray:  'text-gray-900',
    red:   'text-red-600',
    green: 'text-green-700',
    amber: 'text-amber-700',
  }[tone]
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-gray-500">
        {label}
        {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
      </span>
      <span className={`text-sm font-semibold ${toneCls}`}>{value}</span>
    </div>
  )
}

function ReceivedDetail({ d }) {
  return (
    <div className="mt-4 pt-4 border-t border-line">
      <Row label="Payments received" value={fmtMWK(d.gross)} />
      {d.refunded > 0 && <Row label="Less refunds" value={`(${fmtMWK(d.refunded)})`} tone="red" />}
      {/* Only shown once a reversal exists, so the panel does not carry a
          permanent zero row for a correction that has never happened. */}
      {d.reversed > 0 && (
        <Row label="Less reversals" value={`(${fmtMWK(d.reversed)})`} tone="red"
          hint="Corrections to mis-keyed entries — money that never arrived" />
      )}
      <Row label="Billed" value={fmtMWK(d.billed)} />
      <Row
        label={d.outstanding >= 0 ? 'Not yet received' : 'Received above the bill'}
        value={fmtMWK(Math.abs(d.outstanding))}
        tone={d.outstanding > 0 ? 'amber' : d.outstanding < 0 ? 'amber' : 'green'}
      />
    </div>
  )
}

function NetOfCostDetail({ d, available }) {
  return (
    <div className="mt-4 pt-4 border-t border-line">
      <Row label="Billed" value={fmtMWK(d.billed)} />
      <Row label="Stock cost" value={available ? fmtMWK(d.cost) : '—'} tone={available ? 'red' : 'gray'} />
      <Row label="Margin" value={d.marginPct === null ? '—' : `${d.marginPct.toFixed(1)}%`} tone="green" />

      {/* "We are missing two prices" and "we record no prices at all" are
          different problems and must not read the same on screen. */}
      {d.costSourceMissing && (
        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-700 mb-1">No cost source exists yet</p>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            The system does not record what stock costs. A delivery is stored as a stock movement,
            which carries quantity but no price, and the one cost column in the database
            (<code className="text-gray-600">deliveries.unit_cost</code>) belongs to a table nothing
            writes to. This reading will produce a real number as soon as purchase cost is captured —
            the calculation is built and tested; only the data is missing.
          </p>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        {d.consumedUnits} unit{d.consumedUnits === 1 ? '' : 's'} of stock consumed
        {d.unpriced > 0 && ` · ${d.unpriced} line${d.unpriced === 1 ? '' : 's'} with no unit cost`}
        . Labour and overhead are not in this figure — the system holds no cost for either.
      </p>
    </div>
  )
}

function ByLineDetail({ lines, d, total }) {
  if (lines.length === 0) return null
  return (
    <div className="mt-4 pt-4 border-t border-line">
      {lines.map(l => (
        <div key={l.category} className="py-2">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-gray-700">
              {l.category}
              <span className="text-[11px] text-gray-400 ml-1.5">
                {l.count} item{l.count === 1 ? '' : 's'}
              </span>
            </span>
            <span className="text-sm font-semibold text-gray-900">{fmtMWK(l.amount)}</span>
          </div>
          <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-teal rounded-full" style={{ width: `${l.pct}%` }} />
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{l.pct.toFixed(1)}% of the bill</p>
        </div>
      ))}
      <div className="mt-3 pt-3 border-t border-line">
        <Row label="Bill total" value={fmtMWK(total)} />
        <Row label="Collected against it" value={fmtMWK(d.collected)}
          tone={d.outstanding > 0 ? 'amber' : 'green'} />
      </div>
    </div>
  )
}
