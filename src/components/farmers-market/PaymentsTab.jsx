import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Th, Td, Toast, useFlash } from '../admin/AdminUI'
import { FM_PAY_METHODS, fmtDate, fmtMWK, todayStr } from './FarmersMarketUI'

// Form dropdown — application and registration only (visit fees are logged from Market Day tab)
const REG_PAY_TYPES = [
  { value: 'application', label: 'Application Fee', amount: 10000 },
  { value: 'acceptance',  label: 'Registration Fee', amount: 20000 },
]

// Label map for history display — covers all payment types including visit
const PAY_TYPE_LABELS = {
  application: 'Application Fee',
  acceptance:  'Registration Fee',
  visit:       'Visit Fee',
}

export default function PaymentsTab() {
  const { session } = useAuth()

  const [holders,    setHolders]    = useState([])
  const [payments,   setPayments]   = useState([])
  const [userMap,    setUserMap]    = useState({})
  const [toast,      setToast]      = useState(null)
  const [busy,       setBusy]       = useState(false)
  const flash = useFlash(setToast)

  const [filterHolder, setFilterHolder] = useState('')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')

  const BLANK_FORM = {
    holder_id:      '',
    payment_type:   'application',
    amount:         '10000',
    payment_date:   todayStr(),
    payment_method: 'cash',
    reference:      '',
    notes:          '',
  }
  const [form, setForm] = useState(BLANK_FORM)

  function f(field) {
    return e => setForm(p => ({ ...p, [field]: e.target.value }))
  }

  async function load() {
    const [holdersR, paymentsR, profilesR] = await Promise.all([
      supabaseAdmin.from('fm_holders').select('id, full_name, stall_number, status')
        .not('status', 'eq', 'inactive').order('stall_number'),
      supabaseAdmin.from('fm_payments')
        .select('*, fm_holders(full_name, stall_number)')
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabaseAdmin.from('user_profiles').select('id, full_name'),
    ])
    setHolders(holdersR.data ?? [])
    setPayments(paymentsR.data ?? [])
    const map = {}
    for (const u of (profilesR.data ?? [])) map[u.id] = u.full_name
    setUserMap(map)
  }

  useEffect(() => { load() }, [])

  // Monthly summary
  const now        = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthPayments = payments.filter(p => p.payment_date >= monthStart)

  const monthTotals = REG_PAY_TYPES.reduce((acc, t) => {
    acc[t.value] = monthPayments
      .filter(p => p.payment_type === t.value)
      .reduce((s, p) => s + Number(p.amount), 0)
    return acc
  }, {})
  // Grand total includes all payment types (application + acceptance + visit fees from Market Day tab)
  const monthGrandTotal = monthPayments.reduce((s, p) => s + Number(p.amount), 0)

  // History filter
  const filtered = payments.filter(p => {
    if (filterHolder && p.holder_id !== filterHolder) return false
    if (filterFrom   && p.payment_date < filterFrom)  return false
    if (filterTo     && p.payment_date > filterTo)    return false
    return true
  })

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const { error } = await supabaseAdmin.from('fm_payments').insert({
        holder_id:      form.holder_id,
        payment_type:   form.payment_type,
        amount:         Number(form.amount),
        payment_date:   form.payment_date,
        payment_method: form.payment_method,
        reference:      form.reference || null,
        notes:          form.notes     || null,
        recorded_by:    session?.user?.id ?? null,
      })
      if (error) throw error

      if (form.payment_type === 'application') {
        await supabaseAdmin.from('fm_holders').update({ application_paid: true }).eq('id', form.holder_id)
      }
      if (form.payment_type === 'acceptance') {
        await supabaseAdmin.from('fm_holders').update({ acceptance_paid: true }).eq('id', form.holder_id)
      }

      flash('Payment recorded')
      setForm(BLANK_FORM)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  return (
    <div className="p-6">
      <Toast toast={toast} />

      {/* Monthly summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total This Month</p>
          <p className="text-xl font-bold text-gray-900">{fmtMWK(monthGrandTotal)}</p>
        </div>
        {REG_PAY_TYPES.map(t => (
          <div key={t.value} className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{t.label}</p>
            <p className="text-lg font-semibold text-gray-900">{fmtMWK(monthTotals[t.value] ?? 0)}</p>
          </div>
        ))}
      </div>

      {/* Log payment form */}
      <div className="border border-gray-200 rounded-xl p-5 mb-8">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Log Application or Registration Fee Payment</h3>
        <p className="text-xs text-gray-400 mb-4">Visit fees are logged on the Market Day tab.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Holder *">
              <Sel required value={form.holder_id} onChange={f('holder_id')}>
                <option value="">Select holder…</option>
                {holders.map(h => (
                  <option key={h.id} value={h.id}>{h.stall_number} — {h.full_name}</option>
                ))}
              </Sel>
            </Field>
            <Field label="Payment Type *">
              <Sel required value={form.payment_type}
                onChange={e => {
                  const found = REG_PAY_TYPES.find(t => t.value === e.target.value)
                  setForm(p => ({ ...p, payment_type: e.target.value, amount: String(found?.amount ?? p.amount) }))
                }}>
                {REG_PAY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Sel>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Amount (MWK) *">
              <Inp type="number" required min="0.01" step="any"
                value={form.amount} onChange={f('amount')} />
            </Field>
            <Field label="Payment Date *">
              <Inp type="date" required value={form.payment_date} onChange={f('payment_date')} />
            </Field>
            <Field label="Method *">
              <Sel required value={form.payment_method} onChange={f('payment_method')}>
                {FM_PAY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Sel>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Reference">
              <Inp placeholder="Receipt / transaction ref" value={form.reference} onChange={f('reference')} />
            </Field>
            <Field label="Notes">
              <Inp placeholder="Any notes…" value={form.notes} onChange={f('notes')} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-4 text-xs bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-500">
            {REG_PAY_TYPES.map(t => (
              <span key={t.value}>
                {t.label} — <strong className="text-gray-700">{fmtMWK(t.amount)}</strong>
              </span>
            ))}
          </div>

          <button type="submit" disabled={busy}
            className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
            {busy ? 'Recording…' : 'Record Payment'}
          </button>
        </form>
      </div>

      {/* History filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Filter by Holder</label>
          <select
            value={filterHolder}
            onChange={e => setFilterHolder(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            <option value="">All holders</option>
            {holders.map(h => <option key={h.id} value={h.id}>{h.stall_number} — {h.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
        {(filterHolder || filterFrom || filterTo) && (
          <button onClick={() => { setFilterHolder(''); setFilterFrom(''); setFilterTo('') }}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded-lg">
            Clear
          </button>
        )}
        <span className="text-xs text-gray-400 self-end pb-1.5 ml-auto">
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Payment history table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Date</Th>
              <Th>Holder</Th>
              <Th>Stall No</Th>
              <Th>Type</Th>
              <Th>Amount</Th>
              <Th>Method</Th>
              <Th>Reference</Th>
              <Th>Recorded By</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                <Td>{fmtDate(p.payment_date)}</Td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.fm_holders?.full_name ?? '—'}</td>
                <Td>{p.fm_holders?.stall_number}</Td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {PAY_TYPE_LABELS[p.payment_type] ?? p.payment_type}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900">{fmtMWK(p.amount)}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {FM_PAY_METHODS.find(m => m.value === p.payment_method)?.label ?? p.payment_method}
                </td>
                <Td>{p.reference}</Td>
                <Td>{p.recorded_by ? userMap[p.recorded_by] : null}</Td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">No payments found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
