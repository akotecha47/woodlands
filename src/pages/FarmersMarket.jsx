import { useState, useEffect, Fragment } from 'react'
import { CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── constants ─────────────────────────────────────────────────

const TABS = [
  { id: 'market',   label: 'Market Day'  },
  { id: 'holders',  label: 'Holders'     },
  { id: 'add',      label: 'Add Holder'  },
  { id: 'payments', label: 'Payments'    },
]

const FEE = { application: 10000, acceptance: 20000, visit: 10000 }
const PAY_METHODS = ['cash', 'bank transfer', 'Mpamba', 'Airtel Money']

// ── date helpers ──────────────────────────────────────────────

function toDateStr(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

const todayStr = () => toDateStr(new Date())

function getLastSaturday(year, month) {
  // month is 0-indexed (0 = January). Returns a 'YYYY-MM-DD' string.
  const lastDay = new Date(year, month + 1, 0) // day 0 of next month = last day of this month
  const offset = (lastDay.getDay() - 6 + 7) % 7 // days to subtract to reach Saturday (day 6)
  lastDay.setDate(lastDay.getDate() - offset)
  return toDateStr(lastDay)
}

function defaultMarketDate() {
  const now = new Date()
  return getLastSaturday(now.getFullYear(), now.getMonth())
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMWK(n) {
  return `MWK ${Number(n).toLocaleString('en-US')}`
}

// ── shared UI primitives ──────────────────────────────────────

const fieldCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Inp(props)                  { return <input  className={fieldCls} {...props} /> }
function Sel({ children, ...props }) { return <select className={fieldCls} {...props}>{children}</select> }

function Th({ children }) {
  return (
    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  )
}

function Td({ children, bold = false }) {
  return (
    <td className={`px-4 py-3 text-sm ${bold ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
      {children ?? '—'}
    </td>
  )
}

function EmptyRow({ cols, msg = 'No records found' }) {
  return <tr><td colSpan={cols} className="px-4 py-8 text-center text-sm text-gray-400">{msg}</td></tr>
}

function ActiveBadge({ active }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function PaidIcon({ paid }) {
  return paid
    ? <CheckCircle2 size={16} className="text-green-600" />
    : <XCircle      size={16} className="text-red-400"   />
}

function ToggleBtn({ on, onClick, onLabel, offLabel }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
        on
          ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
          : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
      }`}
    >
      {on ? onLabel : offLabel}
    </button>
  )
}

function SaveBtn({ busy, label, busyLabel = 'Saving…' }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
    >
      {busy ? busyLabel : label}
    </button>
  )
}

// ── initial form values ───────────────────────────────────────

const BLANK_ADD = {
  full_name: '', business_name: '', stall_number: '',
  product_category: '', phone: '', email: '', joined_date: todayStr(),
}

const BLANK_PAY = {
  holder_id: '', payment_type: 'application', amount: '10000',
  payment_date: todayStr(), method: 'cash', recorded_by_name: '',
}

// ── main component ────────────────────────────────────────────

export default function FarmersMarket() {
  const { session } = useAuth()
  const [tab, setTab] = useState('market')

  // Market day
  const [marketDate, setMarketDate] = useState(defaultMarketDate)
  const [holders,    setHolders]    = useState([]) // active holders (shared: market + payments dropdown)
  const [visits,     setVisits]     = useState([]) // visits for marketDate

  // Holders tab
  const [allHolders,       setAllHolders]      = useState([])
  const [showInactive,     setShowInactive]     = useState(false)
  const [expandedId,       setExpandedId]       = useState(null)
  const [expandedPayments, setExpandedPayments] = useState([])

  // Payments tab
  const [payments, setPayments] = useState([])

  // Forms
  const [addForm, setAddForm] = useState(BLANK_ADD)
  const [payForm, setPayForm] = useState(BLANK_PAY)

  const [busy,  setBusy]  = useState(false)
  const [toast, setToast] = useState(null)

  function flash(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // ── fetchers ─────────────────────────────────────────────────

  async function fetchHolders() {
    const { data } = await supabase
      .from('fm_holders').select('*')
      .eq('is_active', true).order('stall_number')
    if (data) setHolders(data)
  }

  async function fetchAllHolders() {
    const { data } = await supabase
      .from('fm_holders').select('*').order('stall_number')
    if (data) setAllHolders(data)
  }

  async function fetchVisits(date) {
    const { data } = await supabase
      .from('fm_visits').select('*').eq('visit_date', date)
    if (data) setVisits(data)
  }

  async function fetchPayments() {
    const { data } = await supabase
      .from('fm_payments')
      .select('*, fm_holders(full_name)')
      .order('payment_date', { ascending: false })
      .limit(100)
    if (data) setPayments(data)
  }

  // Load active holders on mount (needed for market day + payments dropdown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchHolders() }, [])

  // Fetch visits whenever the selected date changes (also fires on mount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchVisits(marketDate) }, [marketDate])

  // Fetch tab-specific data when switching tabs
  useEffect(() => {
    if (tab === 'holders')  fetchAllHolders()
    if (tab === 'payments') fetchPayments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // ── derived ───────────────────────────────────────────────────

  const visitMap       = Object.fromEntries(visits.map(v => [v.holder_id, v]))
  const checkedInCount = holders.filter(h => visitMap[h.id]?.checked_in_at).length
  const filteredHolders = showInactive ? allHolders : allHolders.filter(h => h.is_active)

  // ── market day toggles ────────────────────────────────────────

  async function toggleCheckIn(holder) {
    const visit = visitMap[holder.id]
    try {
      if (!visit) {
        await supabase.from('fm_visits').insert({
          holder_id:     holder.id,
          visit_date:    marketDate,
          checked_in_at: new Date().toISOString(),
          recorded_by:   session?.user?.id ?? null,
        })
      } else if (visit.checked_in_at) {
        await supabase.from('fm_visits').update({ checked_in_at: null }).eq('id', visit.id)
      } else {
        await supabase.from('fm_visits').update({ checked_in_at: new Date().toISOString() }).eq('id', visit.id)
      }
      fetchVisits(marketDate)
    } catch (err) { flash(err.message, false) }
  }

  async function toggleFeePaid(holder) {
    const visit = visitMap[holder.id]
    try {
      if (!visit) {
        await supabase.from('fm_visits').insert({
          holder_id:   holder.id,
          visit_date:  marketDate,
          fee_paid:    true,
          recorded_by: session?.user?.id ?? null,
        })
      } else {
        await supabase.from('fm_visits').update({ fee_paid: !visit.fee_paid }).eq('id', visit.id)
      }
      fetchVisits(marketDate)
    } catch (err) { flash(err.message, false) }
  }

  // ── holder row expansion ──────────────────────────────────────

  async function handleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedPayments([])
      return
    }
    setExpandedId(id)
    const { data } = await supabase
      .from('fm_payments').select('*')
      .eq('holder_id', id).order('payment_date', { ascending: false })
    setExpandedPayments(data ?? [])
  }

  // ── add holder ────────────────────────────────────────────────

  async function handleAddHolder(e) {
    e.preventDefault(); setBusy(true)
    try {
      const { error } = await supabase.from('fm_holders').insert({
        full_name:        addForm.full_name,
        business_name:    addForm.business_name    || null,
        stall_number:     addForm.stall_number     || null,
        product_category: addForm.product_category || null,
        phone:            addForm.phone            || null,
        email:            addForm.email            || null,
        joined_date:      addForm.joined_date      || null,
        is_active:        true,
        application_paid: false,
        acceptance_paid:  false,
      })
      if (error) throw error
      flash('Holder added')
      setAddForm(BLANK_ADD)
      fetchHolders()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  // ── log payment ───────────────────────────────────────────────

  async function handlePayment(e) {
    e.preventDefault(); setBusy(true)
    try {
      const { error } = await supabase.from('fm_payments').insert({
        holder_id:        payForm.holder_id,
        amount:           Number(payForm.amount),
        payment_date:     new Date(`${payForm.payment_date}T12:00:00`).toISOString(),
        payment_type:     payForm.payment_type,
        method:           payForm.method           || null,
        recorded_by:      session?.user?.id        ?? null,
        recorded_by_name: payForm.recorded_by_name || null,
      })
      if (error) throw error

      // Update holder flags for application / acceptance payments
      if (payForm.payment_type === 'application') {
        await supabase.from('fm_holders')
          .update({ application_paid: true, updated_at: new Date().toISOString() })
          .eq('id', payForm.holder_id)
      }
      if (payForm.payment_type === 'acceptance') {
        await supabase.from('fm_holders')
          .update({ acceptance_paid: true, updated_at: new Date().toISOString() })
          .eq('id', payForm.holder_id)
      }

      flash('Payment recorded')
      setPayForm(f => ({ ...f, holder_id: '', recorded_by_name: '' }))
      fetchPayments()
      fetchHolders() // refresh paid flags for the dropdown
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  // ── render ────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-gray-900">Farmers Market</h1>

      {toast && (
        <div className={`fixed top-4 right-4 z-40 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">

        {/* ── Market Day ──────────────────────────────── */}
        {tab === 'market' && (
          <div className="p-6">
            <div className="flex items-center gap-4 mb-5 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Market Date</label>
                <input
                  type="date"
                  value={marketDate}
                  onChange={e => setMarketDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div className="ml-auto bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                <span className="text-sm font-semibold text-green-700">
                  {checkedInCount} / {holders.length} checked in
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <Th>Stall No</Th><Th>Name</Th><Th>Business</Th>
                    <Th>Type</Th><Th>Checked In</Th><Th>Fee Paid</Th>
                  </tr>
                </thead>
                <tbody>
                  {holders.map(h => {
                    const visit = visitMap[h.id]
                    return (
                      <tr key={h.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <Td>{h.stall_number}</Td>
                        <Td bold>{h.full_name}</Td>
                        <Td>{h.business_name}</Td>
                        <Td>{h.product_category}</Td>
                        <td className="px-4 py-3">
                          <ToggleBtn
                            on={!!visit?.checked_in_at}
                            onClick={() => toggleCheckIn(h)}
                            onLabel="Checked In ✓"
                            offLabel="Check In"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <ToggleBtn
                            on={!!visit?.fee_paid}
                            onClick={() => toggleFeePaid(h)}
                            onLabel="Paid ✓"
                            offLabel="Mark Paid"
                          />
                        </td>
                      </tr>
                    )
                  })}
                  {holders.length === 0 && <EmptyRow cols={6} msg="No active holders" />}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Holders ─────────────────────────────────── */}
        {tab === 'holders' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800">Holders</h2>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={e => setShowInactive(e.target.checked)}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-600"
                />
                Show inactive
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <Th>Stall No</Th><Th>Name</Th><Th>Business</Th><Th>Type</Th>
                    <Th>Phone</Th><Th>App. Paid</Th><Th>Accept. Paid</Th><Th>Status</Th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filteredHolders.map(h => (
                    <Fragment key={h.id}>
                      <tr
                        className={`border-b border-gray-100 cursor-pointer transition-colors ${
                          expandedId === h.id ? 'bg-green-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleExpand(h.id)}
                      >
                        <Td>{h.stall_number}</Td>
                        <Td bold>{h.full_name}</Td>
                        <Td>{h.business_name}</Td>
                        <Td>{h.product_category}</Td>
                        <Td>{h.phone}</Td>
                        <td className="px-4 py-3"><PaidIcon paid={h.application_paid} /></td>
                        <td className="px-4 py-3"><PaidIcon paid={h.acceptance_paid}  /></td>
                        <td className="px-4 py-3"><ActiveBadge active={h.is_active} /></td>
                        <td className="px-3 py-3 text-gray-400">
                          {expandedId === h.id
                            ? <ChevronUp size={14} />
                            : <ChevronDown size={14} />}
                        </td>
                      </tr>

                      {expandedId === h.id && (
                        <tr>
                          <td colSpan={9} className="bg-gray-50 border-b border-gray-200 px-8 py-5">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                              Payment History
                            </p>
                            {expandedPayments.length === 0 ? (
                              <p className="text-sm text-gray-400">No payments recorded</p>
                            ) : (
                              <table className="w-full max-w-2xl">
                                <thead>
                                  <tr>
                                    {['Type', 'Amount', 'Date', 'Method', 'Recorded By'].map(col => (
                                      <th key={col} className="text-left pb-2 text-xs font-semibold text-gray-500 uppercase pr-6">
                                        {col}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedPayments.map(p => (
                                    <tr key={p.id} className="border-t border-gray-100">
                                      <td className="py-2 pr-6 text-sm text-gray-700 capitalize">{p.payment_type}</td>
                                      <td className="py-2 pr-6 text-sm font-semibold text-gray-900">{fmtMWK(p.amount)}</td>
                                      <td className="py-2 pr-6 text-sm text-gray-600">{fmtDate(p.payment_date)}</td>
                                      <td className="py-2 pr-6 text-sm text-gray-600 capitalize">{p.method ?? '—'}</td>
                                      <td className="py-2 text-sm text-gray-600">{p.recorded_by_name ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {filteredHolders.length === 0 && <EmptyRow cols={9} msg="No holders found" />}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Add Holder ──────────────────────────────── */}
        {tab === 'add' && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-5">Add Holder</h2>
            <form onSubmit={handleAddHolder} className="space-y-4 max-w-lg">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name *">
                  <Inp
                    required
                    value={addForm.full_name}
                    onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="Full name"
                  />
                </Field>
                <Field label="Business Name">
                  <Inp
                    value={addForm.business_name}
                    onChange={e => setAddForm(f => ({ ...f, business_name: e.target.value }))}
                    placeholder="Trading name"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Stall Number">
                  <Inp
                    value={addForm.stall_number}
                    onChange={e => setAddForm(f => ({ ...f, stall_number: e.target.value }))}
                    placeholder="e.g. A1"
                  />
                </Field>
                <Field label="Stall Type">
                  <Inp
                    value={addForm.product_category}
                    onChange={e => setAddForm(f => ({ ...f, product_category: e.target.value }))}
                    placeholder="e.g. Vegetables"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone">
                  <Inp
                    type="tel"
                    value={addForm.phone}
                    onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                  />
                </Field>
                <Field label="Email">
                  <Inp
                    type="email"
                    value={addForm.email}
                    onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  />
                </Field>
              </div>

              <Field label="Joined Date">
                <Inp
                  type="date"
                  value={addForm.joined_date}
                  onChange={e => setAddForm(f => ({ ...f, joined_date: e.target.value }))}
                />
              </Field>

              <SaveBtn busy={busy} label="Add Holder" />
            </form>
          </div>
        )}

        {/* ── Payments ────────────────────────────────── */}
        {tab === 'payments' && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-5">Log Payment</h2>

            <form onSubmit={handlePayment} className="space-y-4 max-w-lg mb-10">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Holder">
                  <Sel
                    required
                    value={payForm.holder_id}
                    onChange={e => setPayForm(f => ({ ...f, holder_id: e.target.value }))}
                  >
                    <option value="">Select holder…</option>
                    {holders.map(h => (
                      <option key={h.id} value={h.id}>
                        {h.full_name}{h.stall_number ? ` (${h.stall_number})` : ''}
                      </option>
                    ))}
                  </Sel>
                </Field>
                <Field label="Payment Type">
                  <Sel
                    required
                    value={payForm.payment_type}
                    onChange={e => setPayForm(f => ({
                      ...f,
                      payment_type: e.target.value,
                      amount: String(FEE[e.target.value] ?? f.amount),
                    }))}
                  >
                    <option value="application">Application</option>
                    <option value="acceptance">Acceptance</option>
                    <option value="visit">Visit</option>
                  </Sel>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Amount (MWK)">
                  <Inp
                    type="number"
                    required
                    min="0"
                    value={payForm.amount}
                    onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  />
                </Field>
                <Field label="Date">
                  <Inp
                    type="date"
                    required
                    value={payForm.payment_date}
                    onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Method">
                  <Sel
                    value={payForm.method}
                    onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}
                  >
                    {PAY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </Sel>
                </Field>
                <Field label="Recorded By">
                  <Inp
                    value={payForm.recorded_by_name}
                    onChange={e => setPayForm(f => ({ ...f, recorded_by_name: e.target.value }))}
                    placeholder="Your name"
                  />
                </Field>
              </div>

              {/* Fee reference strip */}
              <div className="flex flex-wrap gap-4 text-xs bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-500">
                <span>Application — <strong className="text-gray-700">MWK 10,000</strong></span>
                <span>Acceptance — <strong className="text-gray-700">MWK 20,000</strong></span>
                <span>Visit — <strong className="text-gray-700">MWK 10,000</strong></span>
              </div>

              <SaveBtn busy={busy} label="Record Payment" />
            </form>

            {/* Recent payments table */}
            <div className="border-t border-gray-100 pt-6">
              <h2 className="text-base font-semibold text-gray-800 mb-3">Recent Payments</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <Th>Holder</Th><Th>Type</Th><Th>Amount</Th>
                      <Th>Date</Th><Th>Method</Th><Th>Recorded By</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <Td bold>{p.fm_holders?.full_name}</Td>
                        <td className="px-4 py-3 text-sm text-gray-700 capitalize">{p.payment_type}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{fmtMWK(p.amount)}</td>
                        <Td>{fmtDate(p.payment_date)}</Td>
                        <td className="px-4 py-3 text-sm text-gray-600 capitalize">{p.method ?? '—'}</td>
                        <Td>{p.recorded_by_name}</Td>
                      </tr>
                    ))}
                    {payments.length === 0 && <EmptyRow cols={6} msg="No payments recorded yet" />}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
