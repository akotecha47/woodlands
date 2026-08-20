import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { FM_FEES } from '../../lib/constants'
import { FM_MANAGE_ROLES } from '../../lib/roles'
import { getMarketDayForMonth, AccessDenied } from './FarmersMarketUI'
import { Button, Field, Inp, SearchInput, EmptyState } from '../ui/kit'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function fmtLongDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

function defaultMonthVal() {
  const now = new Date()
  if (now.getMonth() === 11) return `${now.getFullYear() + 1}-01`
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function MonthlyMessagesTab() {
  const { profile } = useAuth()
  const canAccess = FM_MANAGE_ROLES.includes(profile?.role)

  const [monthVal,  setMonthVal]  = useState(defaultMonthVal)
  const [holders,   setHolders]   = useState([])
  const [itemsMap,  setItemsMap]  = useState({})   // holder_id → string[]
  const [visitPaid, setVisitPaid] = useState(new Set()) // holder_ids with visit paid this month
  const [copiedKey, setCopiedKey] = useState(null)
  // U-09 — the individual messages are generated one per active business, so
  // on live data that is a three-hundred-card scroll with no way to reach one.
  // This filters the cards ALREADY generated: the generator, the query behind
  // it and the message text itself are untouched.
  const [msgQuery,  setMsgQuery]  = useState('')

  // Derived from month selection
  const [selYear, selMonthStr] = monthVal.split('-')
  const selMonthIdx = Number(selMonthStr)           // 1-based
  const isDecember  = selMonthIdx === 12
  const marketDate  = isDecember ? null : getMarketDayForMonth(Number(selYear), selMonthIdx - 1)

  async function loadHolders() {
    const [holdersR, itemsR] = await Promise.all([
      supabase
        .from('fm_holders')
        .select('id, full_name, business_name, stall_number, application_paid, acceptance_paid')
        .eq('status', 'active')
        .order('stall_number'),
      // item_name is now an OPTIONAL free-text qualifier (061); the real
      // classification is item_id into the fm_items catalogue. Read the
      // catalogue name and fall back to the qualifier only if it is missing.
      supabase
        .from('fm_approved_items')
        .select('holder_id, item_name, fm_items(name)')
        .order('created_at'),
    ])
    setHolders(holdersR.data ?? [])
    const map = {}
    for (const item of (itemsR.data ?? [])) {
      if (!map[item.holder_id]) map[item.holder_id] = []
      const label = item.fm_items?.name ?? item.item_name
      if (label) map[item.holder_id].push(label)
    }
    setItemsMap(map)
  }

  async function loadVisitPayments() {
    if (isDecember) { setVisitPaid(new Set()); return }
    const monthStart = `${selYear}-${selMonthStr}-01`
    const lastDay    = new Date(Number(selYear), selMonthIdx, 0).getDate()
    const monthEnd   = `${selYear}-${selMonthStr}-${String(lastDay).padStart(2, '0')}`
    const { data } = await supabase
      .from('fm_payments')
      .select('holder_id')
      .eq('payment_type', 'visit')
      .gte('payment_date', monthStart)
      .lte('payment_date', monthEnd)
    setVisitPaid(new Set((data ?? []).map(p => p.holder_id)))
  }

  useEffect(() => { loadHolders() }, [])
  useEffect(() => { loadVisitPayments() }, [monthVal])

  if (!canAccess) return <AccessDenied />

  // ── message builders ───────────────────────────────────────────────────────

  function buildGroupMessage() {
    if (!marketDate) return ''
    const dateStr = fmtLongDate(marketDate)
    const lines = [
      'Hello everyone 👋',
      '',
      `Reminder that the Woodlands Lodge Farmers Market is on ${dateStr}. Set up by 07:30, pack up by 12:30.`,
      '',
      'Approved businesses this month:',
    ]
    holders.forEach((h, i) => {
      const name = h.business_name ? `${h.business_name} (${h.full_name})` : h.full_name
      lines.push(`${i + 1}. ${h.stall_number} — ${name}`)
    })
    lines.push('', 'See you Saturday!', 'Woodlands Lodge')
    return lines.join('\n')
  }

  function buildIndividualMessage(h) {
    if (!marketDate) return ''
    const dateStr   = fmtLongDate(marketDate)
    const items     = itemsMap[h.id] ?? []
    const monthName = MONTH_NAMES[selMonthIdx - 1]

    const outstanding = []
    if (!h.application_paid) outstanding.push(`- Application fee: MWK ${FM_FEES.application.toLocaleString('en-US')}`)
    if (!h.acceptance_paid)  outstanding.push(`- Registration fee: MWK ${FM_FEES.acceptance.toLocaleString('en-US')}`)
    if (!visitPaid.has(h.id)) outstanding.push(`- Visit fee for ${monthName}: MWK ${FM_FEES.visit.toLocaleString('en-US')}`)

    const lines = [
      `Hi ${h.full_name},`,
      '',
      `Quick reminder: Woodlands Lodge Farmers Market on ${dateStr}. Set up by 07:30, pack up by 12:30.`,
      '',
      'Your approved items to sell:',
    ]
    if (items.length === 0) {
      lines.push('Please confirm with us what you will be selling this month.')
    } else {
      items.forEach(item => lines.push(`• ${item}`))
    }
    lines.push('')
    lines.push('Payments outstanding:')
    if (outstanding.length === 0) {
      lines.push('All payments up to date. Thank you!')
    } else {
      outstanding.forEach(line => lines.push(line))
    }
    lines.push('', 'See you Saturday!', 'Woodlands Lodge')
    return lines.join('\n')
  }

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 2000)
    } catch {}
  }

  const groupMsg = buildGroupMessage()
  const groupRows = Math.max(10, groupMsg.split('\n').length + 1)

  const mq = msgQuery.trim().toLowerCase()
  const visibleHolders = mq
    ? holders.filter(h => [h.business_name, h.full_name, h.stall_number]
        .some(v => (v ?? '').toLowerCase().includes(mq)))
    : holders

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <Field label="Month" className="w-48">
          <Inp type="month" value={monthVal} onChange={e => setMonthVal(e.target.value)} />
        </Field>
        {!isDecember && marketDate && (
          <p className="text-xs text-ink-soft pb-2.5 leading-relaxed max-w-sm">
            Generated for the market on{' '}
            <span className="font-semibold text-navy">{fmtLongDate(marketDate)}</span>.
            {' '}December has no market, so no messages are produced for it.
          </p>
        )}
      </div>

      {isDecember ? (
        <div className="border border-line rounded-xl bg-white">
          <EmptyState
            title="No market in December"
            body="The market runs on the last Saturday of every month except December, so there is nothing to send. Pick another month above."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">

          {/* Block A — Group message */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-navy">Group Message</h3>
              <Button variant="secondary" size="sm" onClick={() => copy(groupMsg, 'group')}>
                {copiedKey === 'group' ? 'Copied' : 'Copy to clipboard'}
              </Button>
            </div>
            <textarea
              readOnly
              value={groupMsg}
              rows={groupRows}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-700 font-mono resize-none bg-gray-50 focus:outline-none"
            />
          </div>

          {/* Block B — Individual messages */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-bold text-navy">Individual Messages</h3>
              <p className="text-xs text-ink-soft tnum whitespace-nowrap">
                {visibleHolders.length} of {holders.length}
              </p>
            </div>

            {/* U-09 — find one business without scrolling past three hundred. */}
            <SearchInput
              value={msgQuery}
              onChange={e => setMsgQuery(e.target.value)}
              placeholder="Business, name or stall number…"
              aria-label="Search individual messages"
              className="mb-3"
            />

            <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
              {holders.length === 0 && (
                <EmptyState
                  title="No active businesses"
                  body="Individual messages are generated for active stallholders. Approve a business under Businesses and it will appear here."
                />
              )}
              {holders.length > 0 && visibleHolders.length === 0 && (
                <EmptyState
                  title="No business matches that search"
                  body="Clear the search to see every generated message."
                />
              )}
              {visibleHolders.map(h => {
                const msg  = buildIndividualMessage(h)
                const rows = Math.max(8, msg.split('\n').length + 1)
                return (
                  <div key={h.id} className="border border-line rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-semibold text-gray-900">
                          {h.business_name || h.full_name}
                        </span>
                        <span className="ml-2 text-xs text-gray-400">Stall {h.stall_number}</span>
                      </div>
                      <Button variant="secondary" size="sm" className="shrink-0"
                        onClick={() => copy(msg, h.id)}>
                        {copiedKey === h.id ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                    <textarea
                      readOnly
                      value={msg}
                      rows={rows}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 font-mono resize-none bg-gray-50 focus:outline-none"
                    />
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
