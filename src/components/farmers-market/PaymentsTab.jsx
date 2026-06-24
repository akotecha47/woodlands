import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Th, Td, Toast, useFlash } from '../admin/AdminUI'
import { FM_PAY_METHODS, fmtDate, fmtMWK, todayStr, getMarketDayForMonth } from './FarmersMarketUI'
import { FM_FEES } from '../../lib/constants'

const ALL_PAY_TYPES = [
  { value: 'application', label: 'Application Fee',  amount: FM_FEES.application      },
  { value: 'acceptance',  label: 'Registration Fee', amount: FM_FEES.acceptance       },
  { value: 'visit',       label: 'Visit Fee',        amount: FM_FEES.visit            },
  { value: 'id_card',     label: 'ID Card',          amount: FM_FEES.id_card_standard },
  { value: 'reprint',     label: 'Reprint',          amount: FM_FEES.reprint          },
]

const PAY_TYPE_LABELS = {
  application: 'Application Fee',
  acceptance:  'Registration Fee',
  visit:       'Visit Fee',
  id_card:     'ID Card',
  reprint:     'Reprint',
}

export default function PaymentsTab() {
  const { session } = useAuth()

  const [holders,      setHolders]      = useState([])
  const [payments,     setPayments]     = useState([])
  const [userMap,      setUserMap]      = useState({})
  const [toast,        setToast]        = useState(null)
  const [busy,         setBusy]         = useState(false)
  const [showLogModal, setShowLogModal] = useState(false)
  const [showHistory,  setShowHistory]  = useState(false)
  const [sortByOut,    setSortByOut]    = useState(true)
  const flash = useFlash(setToast)

  const [filterHolder, setFilterHolder] = useState('')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')

  const BLANK_FORM = {
    holder_id:      '',
    payment_type:   'application',
    amount:         String(FM_FEES.application),
    payment_date:   todayStr(),
    payment_method: 'cash',
    reference:      '',
    notes:          '',
  }
  const [form, setForm] = useState(BLANK_FORM)

  function f(field) {
    return e => setForm(p => ({ ...p, [field]: e.target.value }))
  }

  // ── current month context ─────────────────────────────────────────────────
  const now           = new Date()
  const curYear       = now.getFullYear()
  const curMonthIdx   = now.getMonth()                    // 0-indexed
  const isDecemberNow = curMonthIdx === 11
  const curMonthStr   = `${curYear}-${String(curMonthIdx + 1).padStart(2, '0')}`
  const marketDateNow = isDecemberNow ? null : getMarketDayForMonth(curYear, curMonthIdx)

  // ── data ──────────────────────────────────────────────────────────────────

  async function load() {
    const [holdersR, paymentsR, profilesR] = await Promise.all([
      supabaseAdmin
        .from('fm_holders')
        .select('id, full_name, stall_number, status, application_paid, acceptance_paid')
        .not('status', 'eq', 'inactive')
        .order('stall_number'),
      supabaseAdmin
        .from('fm_payments')
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

  // ── derived ───────────────────────────────────────────────────────────────

  const activeHolders  = holders.filter(h => h.status === 'active')
  const pendingHolders = holders.filter(h => h.status === 'pending_review')
  const mainHolders    = holders.filter(h => ['active', 'pending_review'].includes(h.status))

  const monthPayments  = payments.filter(p => p.payment_date?.startsWith(curMonthStr))
  const monthCollected = monthPayments.reduce((s, p) => s + Number(p.amount), 0)
  const visitPaidIds   = new Set(
    monthPayments.filter(p => p.payment_type === 'visit').map(p => p.holder_id)
  )

  function holderOutstanding(h) {
    let total = 0
    if (!h.application_paid) total += FM_FEES.application
    if (!h.acceptance_paid)  total += FM_FEES.acceptance
    if (h.status === 'active' && !isDecemberNow && !visitPaidIds.has(h.id)) total += FM_FEES.visit
    return total
  }

  const totalOutstanding = mainHolders.reduce((s, h) => s + holderOutstanding(h), 0)

  const sortedMainHolders = [...mainHolders].sort((a, b) => {
    if (sortByOut) {
      const diff = holderOutstanding(b) - holderOutstanding(a)
      if (diff !== 0) return diff
    }
    return a.stall_number.localeCompare(b.stall_number)
  })

  const filtered = payments.filter(p => {
    if (filterHolder && p.holder_id !== filterHolder) return false
    if (filterFrom   && p.payment_date < filterFrom)  return false
    if (filterTo     && p.payment_date > filterTo)    return false
    return true
  })

  // ── log payment ───────────────────────────────────────────────────────────

  function openLogModal(holder = null) {
    setForm({ ...BLANK_FORM, holder_id: holder?.id ?? '' })
    setShowLogModal(true)
  }

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
      if (form.payment_type === 'visit') {
        await supabaseAdmin.from('fm_visits')
          .update({ fee_paid: true })
          .eq('holder_id', form.holder_id)
          .eq('visit_date', form.payment_date)
      }

      flash('Payment recorded')
      setShowLogModal(false)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <Toast toast={toast} />

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-xs text-green-700 mb-1">Collected This Month</p>
          <p className="text-xl font-bold text-green-800">{fmtMWK(monthCollected)}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs text-amber-700 mb-1">Outstanding</p>
          <p className="text-xl font-bold text-amber-800">{fmtMWK(totalOutstanding)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Active Businesses</p>
          <p className="text-2xl font-bold text-gray-900">{activeHolders.length}</p>
        </div>
        <div className={`rounded-xl p-4 ${pendingHolders.length > 0 ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
          <p className={`text-xs mb-1 ${pendingHolders.length > 0 ? 'text-blue-700' : 'text-gray-500'}`}>
            Pending Review
          </p>
          <p className={`text-2xl font-bold ${pendingHolders.length > 0 ? 'text-blue-800' : 'text-gray-900'}`}>
            {pendingHolders.length}
          </p>
        </div>
      </div>

      {/* Business Payment Status */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-800">Business Payment Status</h3>
            {marketDateNow && (
              <span className="text-xs text-gray-400">Market: {fmtDate(marketDateNow)}</span>
            )}
            {isDecemberNow && (
              <span className="text-xs text-gray-400">No market in December</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortByOut(p => !p)}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              {sortByOut ? 'Sort: Outstanding ↓' : 'Sort: Stall No ↑'}
            </button>
            <button
              onClick={() => openLogModal()}
              className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              + Log Payment
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <Th>Stall No</Th>
                <Th>Business Name</Th>
                <Th>Approved?</Th>
                <Th>Application Fee</Th>
                <Th>Registration Fee</Th>
                <Th>Visit Fee (This Month)</Th>
                <Th>Total Outstanding</Th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {sortedMainHolders.map(h => {
                const isActive   = h.status === 'active'
                const outstanding = holderOutstanding(h)
                const visitOk    = visitPaidIds.has(h.id)
                return (
                  <tr key={h.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <Td>{h.stall_number}</Td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {h.business_name || h.full_name}
                      {h.business_name && (
                        <span className="block text-xs font-normal text-gray-400">{h.full_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {isActive
                        ? <span className="text-green-600 font-medium">✓ Active</span>
                        : <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {h.application_paid
                        ? <span className="text-green-600 font-medium">✓ Paid</span>
                        : <span className="text-red-600">{fmtMWK(FM_FEES.application)}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {h.acceptance_paid
                        ? <span className="text-green-600 font-medium">✓ Paid</span>
                        : <span className="text-red-600">{fmtMWK(FM_FEES.acceptance)}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {!isActive || isDecemberNow
                        ? <span className="text-gray-400">N/A</span>
                        : visitOk
                          ? <span className="text-green-600 font-medium">✓ Paid</span>
                          : <span className="text-amber-600">{fmtMWK(FM_FEES.visit)}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold">
                      {outstanding > 0
                        ? <span className="text-red-700">{fmtMWK(outstanding)}</span>
                        : <span className="text-green-600">✓ Clear</span>
                      }
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => openLogModal(h)}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors whitespace-nowrap"
                      >
                        Log Payment
                      </button>
                    </td>
                  </tr>
                )
              })}
              {mainHolders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">No businesses found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment History (collapsible) */}
      <div>
        <button
          onClick={() => setShowHistory(p => !p)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors mb-3"
        >
          <span>{showHistory ? '▾' : '▸'}</span>
          Payment History
          <span className="text-xs text-gray-400 font-normal">({payments.length} records)</span>
        </button>

        {showHistory && (
          <>
            <div className="flex flex-wrap gap-3 mb-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Filter by Business</label>
                <select
                  value={filterHolder}
                  onChange={e => setFilterHolder(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                >
                  <option value="">All businesses</option>
                  {holders.map(h => (
                    <option key={h.id} value={h.id}>{h.stall_number} — {h.full_name}</option>
                  ))}
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
                <button
                  onClick={() => { setFilterHolder(''); setFilterFrom(''); setFilterTo('') }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded-lg"
                >
                  Clear
                </button>
              )}
              <span className="text-xs text-gray-400 self-end pb-1.5 ml-auto">
                {filtered.length} record{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <Th>Date</Th>
                    <Th>Business</Th>
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
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {p.fm_holders?.full_name ?? '—'}
                      </td>
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
          </>
        )}
      </div>

      {/* Log Payment modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-gray-900">Log Payment</h4>
              <button
                onClick={() => setShowLogModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Business *">
                  <Sel required value={form.holder_id} onChange={f('holder_id')}>
                    <option value="">Select business…</option>
                    {holders.map(h => (
                      <option key={h.id} value={h.id}>{h.stall_number} — {h.full_name}</option>
                    ))}
                  </Sel>
                </Field>
                <Field label="Payment Type *">
                  <Sel
                    required
                    value={form.payment_type}
                    onChange={e => {
                      const found = ALL_PAY_TYPES.find(t => t.value === e.target.value)
                      setForm(p => ({ ...p, payment_type: e.target.value, amount: String(found?.amount ?? p.amount) }))
                    }}
                  >
                    {ALL_PAY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 bg-brand-teal hover:bg-brand-teal-dark text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
                >
                  {busy ? 'Recording…' : 'Record Payment'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
