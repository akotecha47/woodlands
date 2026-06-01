import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Toast, useFlash, fieldCls } from '../admin/AdminUI'
import { itemLabel, AccessDenied, fetchActiveItems } from './InventoryUI'

const ALLOWED = ['owner', 'manager']

export default function AdjustmentsTab() {
  const { profile, session } = useAuth()
  const [items,    setItems]    = useState([])
  const [stockMap, setStockMap] = useState({}) // stock_item_id → quantity
  const [busy,     setBusy]     = useState(false)
  const [toast,    setToast]    = useState(null)
  const flash = useFlash(setToast)
  const [form, setForm] = useState({ stock_item_id: '', new_quantity: '', reason: '' })

  async function loadData() {
    const [activeItems, { data: cs }] = await Promise.all([
      fetchActiveItems(),
      supabaseAdmin.from('current_stock').select('stock_item_id, quantity'),
    ])
    setItems(activeItems)
    if (cs) setStockMap(Object.fromEntries(cs.map(r => [r.stock_item_id, r.quantity])))
  }

  useEffect(() => {
    if (!ALLOWED.includes(profile?.role)) return
    loadData()
  }, [profile?.role])

  if (!ALLOWED.includes(profile?.role)) return <AccessDenied />

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const newQty = Number(form.new_quantity)
      const oldQty = Number(stockMap[form.stock_item_id] ?? 0)
      const diff   = newQty - oldQty

      const { error: mvErr } = await supabaseAdmin.from('stock_movements').insert({
        stock_item_id:  form.stock_item_id,
        movement_type:  'adjustment',
        quantity_change: diff,
        performed_by:   session.user.id,
        notes:          form.reason || null,
      })
      if (mvErr) throw mvErr

      const { error: csErr } = await supabaseAdmin.from('current_stock').upsert(
        { stock_item_id: form.stock_item_id, quantity: newQty, last_updated: new Date().toISOString() },
        { onConflict: 'stock_item_id' }
      )
      if (csErr) throw csErr

      flash(`Stock set to ${newQty} (${diff >= 0 ? '+' : ''}${diff})`)
      setForm({ stock_item_id: '', new_quantity: '', reason: '' })
      loadData()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  const currentQty = form.stock_item_id !== '' ? (stockMap[form.stock_item_id] ?? 0) : null

  return (
    <div className="p-6 max-w-md">
      <Toast toast={toast} />
      <h2 className="text-base font-semibold text-gray-800 mb-5">Stock Adjustment</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Item *">
          <Sel required value={form.stock_item_id}
            onChange={e => setForm(f => ({ ...f, stock_item_id: e.target.value, new_quantity: '' }))}>
            <option value="">Select item…</option>
            {items.map(i => <option key={i.id} value={i.id}>{itemLabel(i)}</option>)}
          </Sel>
        </Field>
        {currentQty !== null && (
          <p className="text-sm text-gray-500">
            Current stock: <span className="font-medium text-gray-800">{currentQty}</span>
          </p>
        )}
        <Field label="New Quantity *">
          <Inp type="number" required min="0" step="any"
            value={form.new_quantity}
            onChange={e => setForm(f => ({ ...f, new_quantity: e.target.value }))} />
        </Field>
        <Field label="Reason *">
          <textarea required rows={2} className={fieldCls}
            placeholder="Why is this adjustment being made?"
            value={form.reason}
            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
        </Field>
        <Field label="Recorded By">
          <Inp disabled value={profile?.full_name ?? '—'} />
        </Field>
        <button type="submit" disabled={busy}
          className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
          {busy ? 'Saving…' : 'Record Adjustment'}
        </button>
      </form>
    </div>
  )
}
