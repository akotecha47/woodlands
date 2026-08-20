import { useState, useEffect } from 'react'
import { Undo2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Th, Td, Toast } from '../admin/AdminUI'
import { PAY_METHODS, PAY_TYPES, payTypeLabel, fmtDate, fmtMWK, todayStr } from './EventsUI'
import { fieldCls } from '../ui/kit.constants'
import { useFlash } from '../ui/useFlash'

export default function EventPaymentsSection({ eventId, billTotal, canManage, onRefresh }) {
  const { session } = useAuth()
  const [payments, setPayments] = useState([])
  // System users, not the staff roster. received_by FKs to auth.users(id),
  // which a user_profiles.id satisfies and a staff.id never can.
  const [users,    setUsers]    = useState([])
  const [userMap,  setUserMap]  = useState({})
  const [toast,    setToast]    = useState(null)
  const flash = useFlash(setToast)
  const [busy, setBusy] = useState(false)

  // The payment being reversed, and the reason for it. A reversal is a money
  // action, so it is never one click: the reason is required and ends up in the
  // reversal row's notes.
  const [reverseTarget, setReverseTarget] = useState(null)
  const [reverseReason, setReverseReason] = useState('')
  const [reverseBusy,   setReverseBusy]   = useState(false)

  const BLANK_FORM = {
    payment_type: 'deposit', amount: '', payment_date: todayStr(),
    payment_method: 'cash', reference: '', notes: '', received_by: '',
  }
  const [form, setForm] = useState(BLANK_FORM)

  function f(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function load() {
    const [payR, profilesR] = await Promise.all([
      supabase.from('event_payments').select('*')
        .eq('event_id', eventId).order('payment_date'),
      supabase.from('user_profiles').select('id, full_name').order('full_name'),
    ])
    setPayments(payR.data ?? [])
    // One source for both the dropdown and the rendered value, so the write
    // path and the read path can no longer disagree about what received_by is.
    const profiles = profilesR.data ?? []
    setUsers(profiles)
    setUserMap(Object.fromEntries(profiles.map(u => [u.id, u.full_name])))
  }

  useEffect(() => { load() }, [eventId])

  // Which payments have been reversed, and by which row. Derived from
  // reverses_payment_id (migration 062) rather than a status column, so there
  // is one fact about a reversal and it lives on the reversing row.
  const reversedBy = new Map(
    payments.filter(p => p.reverses_payment_id).map(p => [p.reverses_payment_id, p])
  )

  const totalReceived = payments
    .filter(p => p.payment_type !== 'refund' && p.payment_type !== 'reversal')
    .reduce((s, p) => s + Number(p.amount), 0)

  const totalRefunded = payments
    .filter(p => p.payment_type === 'refund')
    .reduce((s, p) => s + Number(p.amount), 0)

  // Reversals are stored POSITIVE, exactly like refunds, because
  // CHECK (amount > 0) makes a negative row impossible. They are subtracted
  // here and reported separately: a refund is money going back to the client, a
  // reversal is money that never arrived in the shape recorded.
  const totalReversed = payments
    .filter(p => p.payment_type === 'reversal')
    .reduce((s, p) => s + Number(p.amount), 0)

  const totalPaid    = totalReceived - totalRefunded - totalReversed
  const billTotalNum = Number(billTotal || 0)
  const difference   = billTotalNum - totalPaid
  const balanceState = difference > 0 ? 'owed' : difference < 0 ? 'credit' : 'settled'
  const absDiff      = Math.abs(difference)

  async function handleAddPayment(e) {
    e.preventDefault()
    if (!form.received_by) { flash('Select who received the payment', false); return }
    if (!form.reference.trim()) { flash('Reference is required', false); return }
    setBusy(true)
    try {
      const { error } = await supabase.from('event_payments').insert({
        event_id:       eventId,
        payment_type:   form.payment_type,
        amount:         Number(form.amount),
        payment_date:   form.payment_date,
        payment_method: form.payment_method,
        reference:      form.reference.trim(),
        notes:          form.notes || null,
        // Who took the money (chosen from the dropdown) vs who keyed it in
        // (the signed-in user). recorded_by FKs to user_profiles(id) and was
        // never populated, so no payment recorded who entered it — the
        // `session` from useAuth() sat unused at :8, which is what gave the
        // omission away.
        received_by:    form.received_by,
        recorded_by:    session?.user?.id ?? null,
        created_at:     new Date().toISOString(),
      })
      if (error) throw error

      if (form.payment_type === 'deposit') {
        await supabase.from('events')
          .update({ deposit_paid: true, updated_at: new Date().toISOString() })
          .eq('id', eventId)
      }

      flash('Payment recorded')
      setForm(BLANK_FORM)
      load()
      onRefresh?.()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  // A correction is a REVERSING ENTRY, never an edit and never a delete.
  // event_payments has no DELETE grant and no DELETE policy by design, and the
  // original figure has to survive its own correction. The RPC writes the
  // reversal and recomputes events.deposit_paid in one transaction — the
  // browser cannot do that across two calls.
  async function handleReverse() {
    if (!reverseTarget) return
    if (!reverseReason.trim()) { flash('Say why this payment is being reversed', false); return }
    setReverseBusy(true)
    try {
      const { error } = await supabase.rpc('reverse_event_payment', {
        p_payment_id: reverseTarget.id,
        p_reason:     reverseReason.trim(),
      })
      if (error) throw error
      flash('Payment reversed')
      setReverseTarget(null)
      setReverseReason('')
      await load()
      // The parent holds the event, and deposit_paid may have just changed.
      onRefresh?.()
    } catch (err) { flash(err.message, false) }
    finally { setReverseBusy(false) }
  }

  return (
    <div>
      <Toast toast={toast} />
      <h3 className="text-sm font-bold text-navy mb-4">Payments</h3>

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
          {totalReversed > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">{fmtMWK(totalReversed)} reversed (corrections)</p>
          )}
        </div>
        <div className={`rounded-xl p-4 ${
          balanceState === 'owed' ? 'bg-red-50' :
          balanceState === 'credit' ? 'bg-amber-50' : 'bg-green-50'
        }`}>
          <p className="text-xs text-gray-500 mb-1">
            {balanceState === 'credit' ? 'Credit Owed to Client' : 'Balance Due'}
          </p>
          <p className={`text-sm font-semibold ${
            balanceState === 'owed' ? 'text-red-700' :
            balanceState === 'credit' ? 'text-amber-700' : 'text-green-700'
          }`}>
            {fmtMWK(absDiff)}
          </p>
          {balanceState === 'owed' && (
            <p className="text-xs text-red-500 mt-0.5">Outstanding</p>
          )}
          {balanceState === 'credit' && (
            <p className="text-xs text-amber-600 mt-0.5">Client has overpaid — process refund or apply credit</p>
          )}
          {balanceState === 'settled' && (
            <p className="text-xs text-green-600 mt-0.5">Settled</p>
          )}
        </div>
      </div>

      {/* Payments table */}
      {payments.length > 0 && (
        <div className="overflow-x-auto mb-6 border border-line rounded-xl">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-line">
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Method</Th>
                <Th>Amount</Th>
                <Th>Reference</Th>
                <Th>Received By</Th>
                {/* recorded_by has been written since Sprint E and displayed
                    nowhere, so verification was by SQL. It is also how "who
                    reversed this" is read. */}
                <Th>Recorded By</Th>
                {canManage && <Th>{''}</Th>}
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const reversal   = reversedBy.get(p.id)
                const isReversed = Boolean(reversal)
                const isReversal = p.payment_type === 'reversal'
                const original   = isReversal
                  ? payments.find(x => x.id === p.reverses_payment_id)
                  : null

                return (
                  <tr key={p.id} className={`border-b border-line hover:bg-gray-50 ${
                    isReversed ? 'bg-gray-50/60 text-gray-400' : ''
                  }`}>
                    <Td>{fmtDate(p.payment_date)}</Td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className={isReversed ? 'line-through' : ''}>
                        {payTypeLabel(p.payment_type)}
                      </span>
                      {isReversed && (
                        <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600">
                          Reversed
                        </span>
                      )}
                      {isReversal && (
                        <span className="block text-[11px] text-gray-400 mt-0.5">
                          reverses the {payTypeLabel(original?.payment_type).toLowerCase()} of{' '}
                          {original ? fmtMWK(original.amount) : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {PAY_METHODS.find(m => m.value === p.payment_method)?.label ?? p.payment_method}
                    </td>
                    <td className={`px-4 py-3 text-sm font-semibold ${
                      isReversed ? 'text-gray-400 line-through' : 'text-gray-900'
                    }`}>
                      {/* Refunds and reversals are both stored positive and both
                          subtract, so both render parenthesised. */}
                      {p.payment_type === 'refund' || isReversal
                        ? <span className={isReversed ? '' : 'text-red-600'}>({fmtMWK(p.amount)})</span>
                        : fmtMWK(p.amount)
                      }
                    </td>
                    <Td>{p.reference}</Td>
                    <Td>{p.received_by ? userMap[p.received_by] : null}</Td>
                    <Td>{p.recorded_by ? userMap[p.recorded_by] : null}</Td>
                    {canManage && (
                      <td className="px-4 py-3 text-sm">
                        {!isReversal && !isReversed && (
                          <button
                            onClick={() => { setReverseTarget(p); setReverseReason('') }}
                            title="Reverse this payment"
                            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 wl-transition">
                            <Undo2 size={13} /> Reverse
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {payments.length === 0 && (
        <p className="text-sm text-ink-soft mb-6">No payments recorded yet. Add one below — a mistake is corrected by reversing the entry, never by editing it.</p>
      )}

      {/* Reverse confirmation. Deliberately explicit about what is about to
          happen, because the row being corrected stays on the ledger for ever. */}
      {reverseTarget && (
        <div className="border border-red-200 bg-red-50 rounded-xl p-5 mb-6">
          <h4 className="text-sm font-semibold text-red-800 mb-1">
            Reverse {payTypeLabel(reverseTarget.payment_type).toLowerCase()} of {fmtMWK(reverseTarget.amount)}
          </h4>
          <p className="text-xs text-red-700 mb-4 max-w-prose">
            This does not delete or edit the original. It records a matching reversal of{' '}
            {fmtMWK(reverseTarget.amount)} against it, so the balance corrects while both rows stay on
            the ledger. Enter the corrected payment afterwards if one is due.
          </p>
          <Field label="Reason *">
            <Inp autoFocus placeholder="e.g. keyed against the wrong event"
              value={reverseReason} onChange={e => setReverseReason(e.target.value)} />
          </Field>
          <div className="flex gap-2 mt-4">
            <button onClick={handleReverse} disabled={reverseBusy}
              className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg text-sm wl-transition disabled:opacity-60">
              {reverseBusy ? 'Reversing…' : 'Reverse payment'}
            </button>
            <button onClick={() => { setReverseTarget(null); setReverseReason('') }} disabled={reverseBusy}
              className="text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add payment form — owner/manager only */}
      {canManage && (
        <div className="border border-line rounded-xl p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">Add Payment</h4>
          <form onSubmit={handleAddPayment} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Payment Date *">
                <Inp type="date" required value={form.payment_date} onChange={f('payment_date')} />
              </Field>
              <Field label="Payment Method *">
                <Sel required value={form.payment_method} onChange={f('payment_method')}>
                  {PAY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Sel>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Reference *">
                <Inp required placeholder="Receipt / transaction ref (required)" value={form.reference} onChange={f('reference')} />
              </Field>
              <Field label="Received By *">
                <Sel required value={form.received_by} onChange={f('received_by')}>
                  <option value="">Select user…</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </Sel>
              </Field>
            </div>
            <Field label="Notes">
              <textarea rows={2} className={`${fieldCls} resize-none`} placeholder="Any notes…"
                value={form.notes} onChange={f('notes')} />
            </Field>
            <button type="submit" disabled={busy}
              className="inline-flex items-center justify-center bg-teal hover:bg-teal-deep text-white font-medium px-4 py-2 rounded-lg text-sm shadow-sm hover:shadow-md wl-transition disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? 'Recording…' : 'Record Payment'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
