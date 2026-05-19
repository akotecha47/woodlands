import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Shared ───────────────────────────────────────────────────────────────────

function Badge({ variant, children }) {
  const cls = {
    green: 'bg-green-100 text-green-700',
    gray:  'bg-gray-100 text-gray-600',
    red:   'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
  }[variant] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  )
}

function Alert({ variant, children }) {
  const cls = variant === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-green-50 border-green-200 text-green-700'
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 ' +
  'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
const submitBtnCls =
  'w-full rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-medium text-white ' +
  'hover:bg-[#15803d] focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50 ' +
  'disabled:opacity-50 transition-colors'
const thCls =
  'whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500'
const tdCls = 'px-4 py-3'

const todayDate = new Date().toISOString().split('T')[0]

// ─── Tab 1: Market Day (check-in) ─────────────────────────────────────────────

function MarketDay() {
  const [holders, setHolders] = useState([])
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  const [marketDate, setMarketDate] = useState(todayDate)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: h }, { data: v }] = await Promise.all([
      supabase.from('farmers_market_holders').select('*').eq('active', true).order('stall_number'),
      supabase.from('farmers_market_visits').select('*').eq('visit_date', marketDate),
    ])
    setHolders(h ?? [])
    setVisits(v ?? [])
    setLoading(false)
  }, [marketDate])

  useEffect(() => { fetchData() }, [fetchData])

  async function toggleCheckin(holder) {
    const existing = visits.find(v => v.holder_id === holder.id)

    if (existing) {
      await supabase.from('farmers_market_visits')
        .update({ checked_in: !existing.checked_in })
        .eq('id', existing.id)
    } else {
      await supabase.from('farmers_market_visits').insert({
        visit_date: marketDate,
        holder_id: holder.id,
        checked_in: true,
      })
    }
    fetchData()
  }

  const checkedIn = visits.filter(v => v.checked_in).length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Market Date</label>
          <input
            type="date"
            value={marketDate}
            onChange={e => setMarketDate(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]"
          />
        </div>
        {!loading && (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{checkedIn}</span> / {holders.length} holders checked in
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Stall', 'Holder', 'Business', 'Type', 'Checked In', 'Action'].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
            ) : holders.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No active holders registered.</td></tr>
            ) : holders.map(h => {
              const visit = visits.find(v => v.holder_id === h.id)
              const checkedIn = visit?.checked_in ?? false
              return (
                <tr key={h.id} className="hover:bg-gray-50/60">
                  <td className={`${tdCls} text-gray-600`}>{h.stall_number ?? '—'}</td>
                  <td className={`${tdCls} font-medium text-gray-900`}>{h.name}</td>
                  <td className={`${tdCls} text-gray-600`}>{h.business_name ?? '—'}</td>
                  <td className={`${tdCls} text-gray-600`}>{h.stall_type ?? '—'}</td>
                  <td className={tdCls}>
                    <Badge variant={checkedIn ? 'green' : 'gray'}>
                      {checkedIn ? 'Yes' : 'No'}
                    </Badge>
                  </td>
                  <td className={tdCls}>
                    <button
                      onClick={() => toggleCheckin(h)}
                      className={[
                        'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                        checkedIn
                          ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          : 'bg-green-600 text-white hover:bg-green-700',
                      ].join(' ')}
                    >
                      {checkedIn ? 'Undo' : 'Check In'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Tab 2: Holders ───────────────────────────────────────────────────────────

function Holders({ holders, loading }) {
  const [showInactive, setShowInactive] = useState(false)
  const visible = showInactive ? holders : holders.filter(h => h.active)

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={e => setShowInactive(e.target.checked)}
          className="rounded border-gray-300 text-[#16a34a] focus:ring-[#16a34a]"
        />
        Show inactive holders
      </label>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Stall', 'Name', 'Business', 'Type', 'Phone', 'Email', 'Status'].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No holders found.</td></tr>
            ) : visible.map(h => (
              <tr key={h.id} className="hover:bg-gray-50/60">
                <td className={`${tdCls} text-gray-600`}>{h.stall_number ?? '—'}</td>
                <td className={`${tdCls} font-medium text-gray-900`}>{h.name}</td>
                <td className={`${tdCls} text-gray-600`}>{h.business_name ?? '—'}</td>
                <td className={`${tdCls} text-gray-600`}>{h.stall_type ?? '—'}</td>
                <td className={`${tdCls} text-gray-600`}>{h.phone ?? '—'}</td>
                <td className={`${tdCls} text-gray-600`}>{h.email ?? '—'}</td>
                <td className={tdCls}>
                  <Badge variant={h.active ? 'green' : 'gray'}>
                    {h.active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Tab 3: Add Holder ────────────────────────────────────────────────────────

const holderDefaults = {
  name: '', business_name: '', phone: '', email: '',
  stall_type: '', stall_number: '', active: true,
}

function AddHolder({ onSaved }) {
  const [form, setForm] = useState(holderDefaults)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true); setError(null); setSuccess(false)

    const payload = {
      name:          form.name,
      business_name: form.business_name || null,
      phone:         form.phone || null,
      email:         form.email || null,
      stall_type:    form.stall_type || null,
      stall_number:  form.stall_number || null,
      active:        true,
    }

    const { error: err } = await supabase.from('farmers_market_holders').insert(payload)
    if (err) { setError(err.message); setSubmitting(false); return }

    setSuccess(true)
    setForm(holderDefaults)
    setSubmitting(false)
    onSaved()
  }

  return (
    <div className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900">Register New Holder</h2>
        {success && <Alert variant="success">Holder registered successfully.</Alert>}
        {error   && <Alert variant="error">{error}</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Holder Name</label>
            <input required type="text" value={form.name} onChange={set('name')}
              placeholder="Full name" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Business Name</label>
            <input type="text" value={form.business_name} onChange={set('business_name')}
              placeholder="Optional" className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Stall Number</label>
            <input type="text" value={form.stall_number} onChange={set('stall_number')}
              placeholder="e.g. A1" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Stall Type</label>
            <input type="text" value={form.stall_type} onChange={set('stall_type')}
              placeholder="e.g. Produce, Crafts, Food" className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Phone</label>
            <input type="tel" value={form.phone} onChange={set('phone')}
              placeholder="Optional" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={form.email} onChange={set('email')}
              placeholder="Optional" className={inputCls} />
          </div>
        </div>

        <button type="submit" disabled={submitting} className={submitBtnCls}>
          {submitting ? 'Saving…' : 'Register Holder'}
        </button>
      </form>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = ['Market Day', 'Holders', 'Add Holder']

export default function FarmersMarket() {
  const [tab, setTab] = useState(0)
  const [holders, setHolders] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchHolders = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('farmers_market_holders')
      .select('*')
      .order('stall_number')
    setHolders(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchHolders() }, [fetchHolders])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Farmers Market</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage market day check-ins and stall holder records.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={[
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === i
                ? 'border-[#16a34a] text-[#16a34a]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <MarketDay />}
      {tab === 1 && <Holders holders={holders} loading={loading} />}
      {tab === 2 && <AddHolder onSaved={() => { fetchHolders(); setTab(1) }} />}
    </div>
  )
}
