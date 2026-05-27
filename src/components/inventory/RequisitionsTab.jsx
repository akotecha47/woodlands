import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Sel, Th, Td, Toast, useFlash, fieldCls } from '../admin/AdminUI'
import { itemLabel, EmptyRow, TdBold, ReqStatusBadge, shiftStock, fetchActiveItems, fetchDepartmentList, fetchUserMap } from './InventoryUI'

const MANAGERS = ['owner', 'manager']

export default function RequisitionsTab() {
  const { profile, session } = useAuth()
  const [items,      setItems]      = useState([])
  const [departments,setDepartments]= useState([])
  const [reqs,       setReqs]       = useState([])
  const [userNames,  setUserNames]  = useState({}) // uuid → full_name
  const [busy,       setBusy]       = useState(false)
  const [toast,      setToast]      = useState(null)
  const flash = useFlash(setToast)
  const [form, setForm] = useState({ stock_item_id: '', department: '', quantity: '', reason: '' })

  const isManager = MANAGERS.includes(profile?.role)

  async function fetchReqs() {
    if (!session?.user?.id) return
    let q = supabaseAdmin
      .from('requisitions')
      .select('*')
      .order('created_at', { ascending: false })
    if (!isManager) q = q.eq('requested_by', session.user.id)
    const { data, error } = await q
    if (error) { flash(error.message, false); return }
    setReqs(data ?? [])
  }

  useEffect(() => {
    fetchActiveItems().then(setItems)
    fetchDepartmentList().then(setDepartments)
    fetchUserMap().then(setUserNames)
    fetchReqs()
  }, [profile?.role, session?.user?.id])

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const { error } = await supabaseAdmin.from('requisitions').insert({
        stock_item_id: form.stock_item_id,
        requested_by:  session.user.id,
        department:    form.department || profile?.department || null,
        quantity:      Number(form.quantity),
        reason:        form.reason || null,
        status:        'pending',
      })
      if (error) throw error
      flash('Requisition submitted')
      setForm({ stock_item_id: '', department: '', quantity: '', reason: '' })
      fetchReqs()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function handleApprove(req) {
    try {
      const { error } = await supabaseAdmin.from('requisitions')
        .update({ status: 'approved', reviewed_by: session.user.id, updated_at: new Date().toISOString() })
        .eq('id', req.id)
      if (error) throw error
      flash('Approved')
      fetchReqs()
    } catch (err) { flash(err.message, false) }
  }

  async function handleFulfil(req) {
    try {
      await shiftStock(req.stock_item_id, -Number(req.quantity))
      const { error: mvErr } = await supabaseAdmin.from('stock_movements').insert({
        stock_item_id:  req.stock_item_id,
        movement_type:  'requisition',
        quantity_change: -Number(req.quantity),
        to_department:  req.department,
        performed_by:   session.user.id,
        notes:          req.reason || null,
      })
      if (mvErr) throw mvErr
      const { error } = await supabaseAdmin.from('requisitions')
        .update({ status: 'fulfilled', reviewed_by: session.user.id, updated_at: new Date().toISOString() })
        .eq('id', req.id)
      if (error) throw error
      flash('Fulfilled — stock deducted')
      fetchReqs()
    } catch (err) { flash(err.message, false) }
  }

  async function handleReject(req) {
    try {
      const { error } = await supabaseAdmin.from('requisitions')
        .update({ status: 'rejected', reviewed_by: session.user.id, updated_at: new Date().toISOString() })
        .eq('id', req.id)
      if (error) throw error
      flash('Rejected')
      fetchReqs()
    } catch (err) { flash(err.message, false) }
  }

  const itemMap = Object.fromEntries(items.map(i => [i.id, i]))
  const managerCols = isManager ? 8 : 6

  return (
    <div className="p-6 space-y-6">
      <Toast toast={toast} />

      {/* ── Raise form ──────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-4">Raise Requisition</h2>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <Field label="Item *">
            <Sel required value={form.stock_item_id}
              onChange={e => setForm(f => ({ ...f, stock_item_id: e.target.value }))}>
              <option value="">Select item…</option>
              {items.map(i => <option key={i.id} value={i.id}>{itemLabel(i)}</option>)}
            </Sel>
          </Field>
          <Field label="Department">
            {profile?.department
              ? <Inp disabled value={profile.department} />
              : <Sel value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                  <option value="">Select department…</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </Sel>
            }
          </Field>
          <Field label="Quantity *">
            <input type="number" required min="0.01" step="any"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          </Field>
          <Field label="Reason">
            <textarea rows={2} className={fieldCls} placeholder="Why is this needed?"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
          </Field>
          <button type="submit" disabled={busy}
            className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
            {busy ? 'Submitting…' : 'Submit Requisition'}
          </button>
        </form>
      </div>

      {/* ── List ────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-6">
        <h2 className="text-base font-semibold text-gray-800 mb-3">
          {isManager ? 'All Requisitions' : 'My Requisitions'}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <Th>Item</Th><Th>Dept</Th><Th>Qty</Th>
                {isManager && <Th>Requested By</Th>}
                <Th>Reason</Th><Th>Date</Th><Th>Status</Th>
                {isManager && <Th>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {reqs.map(r => (
                <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <TdBold>{itemMap[r.stock_item_id]?.name ?? '—'}</TdBold>
                  <Td>{r.department}</Td>
                  <Td>{r.quantity}</Td>
                  {isManager && <Td>{userNames[r.requested_by]}</Td>}
                  <Td>{r.reason}</Td>
                  <Td>{new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Td>
                  <td className="px-4 py-3"><ReqStatusBadge status={r.status} /></td>
                  {isManager && (
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {r.status === 'pending' && <>
                          <button onClick={() => handleApprove(r)}
                            className="px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                            Approve
                          </button>
                          <button onClick={() => handleReject(r)}
                            className="px-2.5 py-1 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg transition-colors">
                            Reject
                          </button>
                        </>}
                        {r.status === 'approved' && (
                          <button onClick={() => handleFulfil(r)}
                            className="px-2.5 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                            Fulfil
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {reqs.length === 0 && <EmptyRow cols={managerCols} msg="No requisitions yet" />}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
