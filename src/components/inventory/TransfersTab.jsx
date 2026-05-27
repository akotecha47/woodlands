import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Toast, useFlash, fieldCls } from '../admin/AdminUI'
import { itemLabel, AccessDenied, fetchActiveItems, fetchDepartmentList, fetchStaffUsers } from './InventoryUI'

const ALLOWED = ['owner', 'manager', 'store_supervisor']

export default function TransfersTab() {
  const { profile, session } = useAuth()
  const [items,       setItems]       = useState([])
  const [departments, setDepartments] = useState([])
  const [staffUsers,  setStaffUsers]  = useState([])
  const [busy,        setBusy]        = useState(false)
  const [toast,       setToast]       = useState(null)
  const flash = useFlash(setToast)
  const [form, setForm] = useState({
    stock_item_id: '', from_department: '', to_department: '', quantity: '', notes: '', received_by_id: '',
  })

  useEffect(() => {
    if (!ALLOWED.includes(profile?.role)) return
    fetchActiveItems().then(setItems)
    fetchDepartmentList().then(setDepartments)
    fetchStaffUsers().then(setStaffUsers)
  }, [profile?.role])

  if (!ALLOWED.includes(profile?.role)) return <AccessDenied />

  const deptError =
    form.from_department && form.to_department && form.from_department === form.to_department
      ? 'From and To departments cannot be the same'
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

      const qty  = Number(form.quantity)
      const base = {
        stock_item_id:   form.stock_item_id,
        movement_type:   'transfer',
        from_department: form.from_department,
        to_department:   form.to_department,
        performed_by:    session.user.id,
        notes:           noteValue,
      }
      // Two rows: negative from source, positive to destination
      const { error } = await supabaseAdmin.from('stock_movements').insert([
        { ...base, quantity_change: -qty },
        { ...base, quantity_change:  qty },
      ])
      if (error) throw error
      flash('Transfer recorded')
      setForm({ stock_item_id: '', from_department: '', to_department: '', quantity: '', notes: '', received_by_id: '' })
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
            <Sel required value={form.from_department}
              onChange={e => setForm(f => ({ ...f, from_department: e.target.value }))}>
              <option value="">Select…</option>
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </Sel>
          </Field>
          <Field label="To *">
            <Sel required value={form.to_department}
              onChange={e => setForm(f => ({ ...f, to_department: e.target.value }))}>
              <option value="">Select…</option>
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
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
          className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
          {busy ? 'Recording…' : 'Record Transfer'}
        </button>
      </form>
    </div>
  )
}
