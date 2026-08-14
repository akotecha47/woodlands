import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Toast, useFlash, fieldCls } from '../admin/AdminUI'
import { itemLabel, AccessDenied, fetchActiveItems, fetchDepartmentList, fetchStaffUsers } from './InventoryUI'
import { MANAGE_ROLES } from '../../lib/roles'
import { transferStock } from '../../lib/stock'
import { stockLocations } from '../../lib/constants'

// 'store_supervisor' removed — see LogDeliveryTab. Dead role, no behaviour change.

export default function TransfersTab() {
  const { profile } = useAuth()
  const [items,      setItems]      = useState([])
  const [locations,  setLocations]  = useState([])
  const [staffUsers, setStaffUsers] = useState([])
  const [busy,       setBusy]       = useState(false)
  const [toast,      setToast]      = useState(null)
  const flash = useFlash(setToast)
  const [form, setForm] = useState({
    stock_item_id: '', from_location: '', to_location: '', quantity: '', notes: '', received_by_id: '',
  })

  useEffect(() => {
    if (!MANAGE_ROLES.includes(profile?.role)) return
    fetchActiveItems().then(setItems)
    // Locations, not departments: 'Main Store' is a stock location and never a
    // departments row (051), so it has to be prepended in code. This is what
    // lets the screen serve manual store→department issues and department→store
    // returns as well as department↔department transfers.
    fetchDepartmentList().then(d => setLocations(stockLocations(d)))
    fetchStaffUsers().then(setStaffUsers)
  }, [profile?.role])

  if (!MANAGE_ROLES.includes(profile?.role)) return <AccessDenied />

  const deptError =
    form.from_location && form.to_location && form.from_location === form.to_location
      ? 'From and To locations cannot be the same'
      : null

  async function handleSubmit(e) {
    e.preventDefault()
    if (deptError) return
    setBusy(true)
    try {
      const receivedName = staffUsers.find(u => u.id === form.received_by_id)?.full_name ?? ''
      const noteValue = [
        receivedName && `Received by: ${receivedName}`,
        form.notes,
      ].filter(Boolean).join('\n') || null

      const qty = Number(form.quantity)
      // This used to insert two stock_movements rows directly (−qty / +qty) and
      // call no RPC at all, so a transfer wrote ledger history and moved no
      // stock — the transfers-don't-deduct bug, found 27 July 2026. The RPC
      // moves both balances in one transaction; it also writes the ledger pair
      // itself, so nothing may insert stock_movements alongside it (see
      // src/lib/stock.js). `performed_by` is gone with it: apply_stock_delta
      // records auth.uid() server-side.
      const res = await transferStock(
        form.stock_item_id, form.from_location, form.to_location, qty, { reason: noteValue },
      )
      // Report what the server actually recorded, not what the screen assumed:
      // a move with the main store at either end is an 'issue', not a
      // 'transfer', and the UI does not get a vote.
      flash(res?.movement_type === 'issue' ? 'Stock issued' : 'Transfer recorded')
      setForm({ stock_item_id: '', from_location: '', to_location: '', quantity: '', notes: '', received_by_id: '' })
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  return (
    <div className="p-6 max-w-md">
      <Toast toast={toast} />
      <h2 className="text-base font-semibold text-gray-800 mb-5">Record Transfer</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Item *">
          <Sel required value={form.stock_item_id}
            onChange={e => setForm(f => ({ ...f, stock_item_id: e.target.value }))}>
            <option value="">Select item…</option>
            {items.map(i => <option key={i.id} value={i.id}>{itemLabel(i)}</option>)}
          </Sel>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From *">
            <Sel required value={form.from_location}
              onChange={e => setForm(f => ({ ...f, from_location: e.target.value }))}>
              <option value="">Select…</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </Sel>
          </Field>
          <Field label="To *">
            <Sel required value={form.to_location}
              onChange={e => setForm(f => ({ ...f, to_location: e.target.value }))}>
              <option value="">Select…</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </Sel>
          </Field>
        </div>
        {deptError && (
          <p className="text-xs text-red-600">{deptError}</p>
        )}
        <Field label="Quantity *">
          <Inp type="number" required min="0.01" step="any"
            value={form.quantity}
            onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
        </Field>
        <Field label="Received By *">
          <Sel required value={form.received_by_id}
            onChange={e => setForm(f => ({ ...f, received_by_id: e.target.value }))}>
            <option value="">Select staff member…</option>
            {staffUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </Sel>
        </Field>
        <Field label="Notes">
          <textarea rows={2} className={fieldCls} placeholder="Reason for transfer…"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </Field>
        <Field label="Transferred By">
          <Inp disabled value={profile?.full_name ?? '—'} />
        </Field>
        <button type="submit" disabled={busy || !!deptError}
          className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
          {busy ? 'Recording…' : 'Record Transfer'}
        </button>
      </form>
    </div>
  )
}
