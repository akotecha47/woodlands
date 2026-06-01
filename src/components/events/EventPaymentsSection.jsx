import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, fieldCls, Th, Td, Toast, useFlash } from '../admin/AdminUI'
import { PAY_METHODS, PAY_TYPES, fmtDate, fmtMWK, todayStr, fetchAllActiveStaff } from './EventsUI'

export default function EventPaymentsSection({ eventId, billTotal, canManage }) {
  const { session } = useAuth()
  const [payments, setPayments] = useState([])
  const [staff,    setStaff]    = useState([])
  const [userMap,  setUserMap]  = useState({})
  const [toast,    setToast]    = useState(null)
  const flash = useFlash(setToast)
  const [busy, setBusy] = useState(false)

  const BLANK_FORM = {
    payment_type: 'deposit', amount: '', payment_date: todayStr(),
    payment_method: 'cash', reference: '', notes: '', received_by: '',
  }
  const [form, setForm] = useState(BLANK_FORM)

  function f(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function load() {
    const [payR, profilesR, activeStaffR] = await Promise.all([
      supabaseAdmin.from('event_payments').select('*')
        .eq('event_id', eventId).order('payment_date'),
      supabaseAdmin.from('user_profiles').select('id, full_name'),
      fetchAllActiveStaff(),
    ])
    setPayments(payR.data ?? [])
    const map = {}
    for (const u of (profilesR.data ?? [])) map[u.id] = u.full_name
    setUserMap(map)
    setStaff(activeStaffR)
  }

  useEffect(() => { load() }, [eventId])

  const totalReceived = payments
    .filter(p => p.payment_type !== 'refund')
    .reduce((s, p) => s + Number(p.amount), 0)

  const totalRefunded = payments
    .filter(p => p.payment_type === 'refund')
    .reduce((s, p) => s + Number(p.amount), 0)

  const totalPaid  = totalReceived - totalRefunded
  const balanceDue = Math.max(0, Number(billTotal || 0) - totalPaid)

  async function handleAddPayment(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const { error } = await supabaseAdmin.from('event_payments').insert({
        event_id:       eventId,
        payment_type:   form.payment_type,
        amount:         Number(form.amount),
        payment_date:   form.payment_date,
        payment_method: form.payment_method,
        reference:      form.reference || null,
        notes:          form.notes || null,
        received_by:    form.received_by || null,
        created_at:     new Date().toISOString(),
      })
      if (error) throw error

      if (form.payment_type === 'deposit') {
        await supabaseAdmin.from('events')
          .update({ deposit_paid: true, updated_at: new Date().toISOString() })
          .eq('id', eventId)
      }

      flash('Payment recorded')
      setForm(BLANK_FORM)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <Toast toast={toast} />
      <h3 className="text-base font-semibold text-gray-800 mb-4">Payments</h3>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Bill Total</p>
          <p className="text-sm font-semibold text-gray-900">{fmtMWK(billTotal)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total Paid</p>
          <p className="text-sm font-semibold text-gray-900">{fmtMWK(totalPaid)}</p>
          {totalRefunded > 0 && (
            <p className="text-xs text-red-500 mt-0.5">incl. {fmtMWK(totalRefunded)} refunded</p>
          )}
        </div>
        <div className={`rounded-xl p-4 ${balanceDue > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <p className="text-xs text-gray-500 mb-1">Balance Due</p>
          <p className={`text-sm font-semibold ${balanceDue > 0 ? 'text-red-700' : 'text-green-700'}`}>
            {fmtMWK(balanceDue)}
          </p>
          {balanceDue > 0 && (
            <p className="text-xs text-red-500 mt-0.5">Outstanding</p>
          )}
        </div>
      </div>

      {/* Payments table */}
      {payments.length > 0 && (
        <div className="overflow-x-auto mb-6 border border-gray-200 rounded-xl">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Method</Th>
                <Th>Amount</Th>
                <Th>Reference</Th>
                <Th>Received By</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <Td>{fmtDate(p.payment_date)}</Td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {PAY_TYPES.find(t => t.value === p.payment_type)?.label ?? p.payment_type}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {PAY_METHODS.find(m => m.value === p.payment_method)?.label ?? p.payment_method}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                    {p.payment_type === 'refund'
                      ? <span className="text-red-600">({fmtMWK(p.amount)})</span>
                      : fmtMWK(p.amount)
                    }
                  </td>
                  <Td>{p.reference}</Td>
                  <Td>{p.received_by ? userMap[p.received_by] : null}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payments.length === 0 && (
        <p className="text-sm text-gray-400 mb-6">No payments recorded yet.</p>
      )}

      {/* Add payment form — owner/manager only */}
      {canManage && (
        <div className="border border-gray-200 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">Add Payment</h4>
          <form onSubmit={handleAddPayment} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Payment Type *">
                <Sel required value={form.payment_type} onChange={f('payment_type')}>
                  {PAY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Sel>
              </Field>
              <Field label="Amount (MWK) *">
                <Inp type="number" required min="0.01" step="any" placeholder="0"
                  value={form.amount} onChange={f('amount')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Payment Date *">
                <Inp type="date" required value={form.payment_date} onChange={f('payment_date')} />
              </Field>
              <Field label="Payment Method *">
                <Sel required value={form.payment_method} onChange={f('payment_method')}>
                  {PAY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Sel>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Reference">
                <Inp placeholder="Receipt / transaction ref" value={form.reference} onChange={f('reference')} />
              </Field>
              <Field label="Received By">
                <Sel value={form.received_by} onChange={f('received_by')}>
                  <option value="">Select staff member…</option>
                  {staff.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </Sel>
              </Field>
            </div>
            <Field label="Notes">
              <textarea rows={2} className={`${fieldCls} resize-none`} placeholder="Any notes…"
                value={form.notes} onChange={f('notes')} />
            </Field>
            <button type="submit" disabled={busy}
              className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
              {busy ? 'Recording…' : 'Record Payment'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
