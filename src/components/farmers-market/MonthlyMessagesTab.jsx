import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { FM_FEES } from '../../lib/constants'
import { fmtDate, getMarketDayForMonth, AccessDenied } from './FarmersMarketUI'

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
  const canAccess = ['owner', 'manager'].includes(profile?.role)

  const [monthVal,  setMonthVal]  = useState(defaultMonthVal)
  const [holders,   setHolders]   = useState([])
  const [itemsMap,  setItemsMap]  = useState({})   // holder_id → string[]
  const [visitPaid, setVisitPaid] = useState(new Set()) // holder_ids with visit paid this month
  const [copiedKey, setCopiedKey] = useState(null)

  // Derived from month selection
  const [selYear, selMonthStr] = monthVal.split('-')
  const selMonthIdx = Number(selMonthStr)           // 1-based
  const isDecember  = selMonthIdx === 12
  const marketDate  = isDecember ? null : getMarketDayForMonth(Number(selYear), selMonthIdx - 1)

  async function loadHolders() {
    const [holdersR, itemsR] = await Promise.all([
      supabaseAdmin
        .from('fm_holders')
        .select('id, full_name, business_name, stall_number, application_paid, acceptance_paid')
        .eq('status', 'active')
        .order('stall_number'),
      supabaseAdmin
        .from('fm_approved_items')
        .select('holder_id, item_name')
        .order('created_at'),
    ])
    setHolders(holdersR.data ?? [])
    const map = {}
    for (const item of (itemsR.data ?? [])) {
      if (!map[item.holder_id]) map[item.holder_id] = []
      map[item.holder_id].push(item.item_name)
    }
    setItemsMap(map)
  }

  async function loadVisitPayments() {
    if (isDecember) { setVisitPaid(new Set()); return }
    const monthStart = `${selYear}-${selMonthStr}-01`
    const lastDay    = new Date(Number(selYear), selMonthIdx, 0).getDate()
    const monthEnd   = `${selYear}-${selMonthStr}-${String(lastDay).padStart(2, '0')}`
    const { data } = await supabaseAdmin
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

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      {/* Controls */}
      <div className="flex items-center gap-4 mb-1 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Month</label>
          <input
            type="month"
            value={monthVal}
            onChange={e => setMonthVal(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
        </div>
        {!isDecember && marketDate && (
          <p className="text-xs text-gray-500">
            Generated for the market on{' '}
            <span className="font-medium">{fmtLongDate(marketDate)}</span>.
            {' '}Skipped if December.
          </p>
        )}
      </div>

      {isDecember ? (
        <div className="rounded-xl border border-gray-200 px-6 py-12 text-center mt-4">
          <p className="text-sm font-medium text-gray-700">
            No market in December — no messages generated.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">

          {/* Block A — Group message */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-800">Group Message</h3>
              <button
                onClick={() => copy(groupMsg, 'group')}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
              >
                {copiedKey === 'group' ? 'Copied!' : 'Copy to Clipboard'}
              </button>
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
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Individual Messages</h3>
            <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
              {holders.length === 0 && (
                <p className="text-sm text-gray-400">No active businesses found.</p>
              )}
              {holders.map(h => {
                const msg  = buildIndividualMessage(h)
                const rows = Math.max(8, msg.split('\n').length + 1)
                return (
                  <div key={h.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-semibold text-gray-900">
                          {h.business_name || h.full_name}
                        </span>
                        <span className="ml-2 text-xs text-gray-400">Stall {h.stall_number}</span>
                      </div>
                      <button
                        onClick={() => copy(msg, h.id)}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shrink-0"
                      >
                        {copiedKey === h.id ? 'Copied!' : 'Copy'}
                      </button>
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
