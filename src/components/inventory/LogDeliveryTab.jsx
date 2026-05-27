import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Toast, useFlash, fieldCls } from '../admin/AdminUI'
import { todayStr, itemLabel, AccessDenied, shiftStock, fetchActiveItems, fetchStaffUsers } from './InventoryUI'

const ALLOWED = ['owner', 'manager', 'store_supervisor']

export default function LogDeliveryTab() {
  const { profile, session } = useAuth()
  const [items,      setItems]      = useState([])
  const [staffUsers, setStaffUsers] = useState([])
  const [busy,       setBusy]       = useState(false)
  const [toast,      setToast]      = useState(null)
  const flash = useFlash(setToast)
  const [form, setForm] = useState({
    stock_item_id: '', quantity: '', supplier: '', date: todayStr(), notes: '', received_by_id: '',
  })

  useEffect(() => {
    if (!ALLOWED.includes(profile?.role)) return
    fetchActiveItems().then(setItems)
    fetchStaffUsers().then(setStaffUsers)
  }, [profile?.role])

  if (!ALLOWED.includes(profile?.role)) return <AccessDenied />

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const receivedName = staffUsers.find(u => u.id === form.received_by_id)?.full_name ?? ''
      const noteValue = [
        form.supplier    && `Supplier: ${form.supplier}`,
        receivedName     && `Received by: ${receivedName}`,
        form.notes,
      ].filter(Boolean).join('\n') || null

      const { error } = await supabaseAdmin.from('stock_movements').insert({
        stock_item_id:   form.stock_item_id,
        movement_type:   'delivery',
        quantity_change:  Number(form.quantity),
        performed_by:    session.user.id,
        notes:           noteValue,
      })
      if (error) throw error
      await shiftStock(form.stock_item_id, Number(form.quantity))
      flash('Delivery logged')
      setForm({ stock_item_id: '', quantity: '', supplier: '', date: todayStr(), notes: '', received_by_id: '' })
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  return (
    <div className="p-6 max-w-md">
      <Toast toast={toast} />
      <h2 className="text-base font-semibold text-gray-800 mb-5">Log Delivery</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Item *">
          <Sel required value={form.stock_item_id}
            onChange={e => setForm(f => ({ ...f, stock_item_id: e.target.value }))}>
            <option value="">Select item…</option>
            {items.map(i => <option key={i.id} value={i.id}>{itemLabel(i)}</option>)}
          </Sel>
        </Field>
        <Field label="Quantity *">
          <Inp type="number" required min="0.01" step="any"
            value={form.quantity}
            onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
        </Field>
        <Field label="Supplier *">
          <Inp required placeholder="Supplier name"
            value={form.supplier}
            onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
        </Field>
        <Field label="Date *">
          <Inp type="date" required
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </Field>
        <Field label="Received By *">
          <Sel required value={form.received_by_id}
            onChange={e => setForm(f => ({ ...f, received_by_id: e.target.value }))}>
            <option value="">Select staff member…</option>
            {staffUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </Sel>
        </Field>
        <Field label="Notes">
          <textarea rows={2} className={fieldCls} placeholder="Any notes…"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </Field>
        <Field label="Logged By">
          <Inp disabled value={profile?.full_name ?? '—'} />
        </Field>
        <button type="submit" disabled={busy}
          className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
          {busy ? 'Logging…' : 'Log Delivery'}
        </button>
      </form>
    </div>
  )
}
