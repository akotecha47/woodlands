import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const TABS = [
  { id: 'stock',        label: 'Stock Levels'  },
  { id: 'delivery',     label: 'Log Delivery'  },
  { id: 'requisitions', label: 'Requisitions'  },
  { id: 'transfers',    label: 'Transfers'     },
  { id: 'adjustments',  label: 'Adjustments'   },
  { id: 'log',          label: 'Delivery Log'  },
]

const ADJ_TYPES = ['spoilt', 'theft', 'guest', 'other']

const fieldCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 disabled:bg-gray-50 disabled:text-gray-500'

const todayStr = () => new Date().toISOString().slice(0, 10)

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── tiny helpers ────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Inp(props) {
  return <input className={fieldCls} {...props} />
}

function Sel({ children, ...props }) {
  return <select className={fieldCls} {...props}>{children}</select>
}

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
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-8 text-center text-sm text-gray-400">{msg}</td>
    </tr>
  )
}

function StockBadge({ item }) {
  const low = Number(item.current_stock) <= Number(item.reorder_level)
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${low ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
      {low ? 'Low Stock' : 'OK'}
    </span>
  )
}

function ReqBadge({ status }) {
  const map = {
    pending:  'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
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

// ── main component ──────────────────────────────────────────

export default function Inventory() {
  const { session, profile } = useAuth()
  const [tab, setTab] = useState('stock')

  // shared item list (dropdowns + stock levels)
  const [items, setItems] = useState([])

  // tab-specific lists
  const [reqs, setReqs] = useState([])
  const [delLog, setDelLog] = useState([])

  // stock level filter
  const [deptFilter, setDeptFilter] = useState('all')

  // forms
  const [delForm, setDelForm] = useState({
    item_id: '', supplier: '', quantity: '', delivery_date: todayStr(), notes: '',
  })
  const [reqForm, setReqForm] = useState({ item_id: '', department: '', quantity: '' })
  const [trxForm, setTrxForm] = useState({
    item_id: '', from_department: '', to_department: '', quantity: '', notes: '',
  })
  const [adjForm, setAdjForm] = useState({
    item_id: '', adjustment_type: 'spoilt', quantity: '', reason: '',
  })

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  function flash(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // ── fetchers ──────────────────────────────────────────────

  async function fetchItems() {
    const { data } = await supabase.from('inventory_items').select('*').order('name')
    if (data) setItems(data)
  }

  async function fetchReqs() {
    const { data } = await supabase
      .from('requisitions')
      .select('*, inventory_items(name), requester:user_profiles!requested_by(full_name)')
      .order('created_at', { ascending: false })
    if (data) setReqs(data)
  }

  async function fetchDelLog() {
    const { data } = await supabase
      .from('deliveries')
      .select('*, inventory_items(name)')
      .order('delivery_date', { ascending: false })
    if (data) setDelLog(data)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchItems() }, [])

  useEffect(() => {
    if (tab === 'requisitions') fetchReqs()
    if (tab === 'log') fetchDelLog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // ── stock helper ──────────────────────────────────────────

  async function shiftStock(itemId, delta) {
    const { data } = await supabase
      .from('inventory_items').select('current_stock').eq('id', itemId).single()
    if (!data) return
    await supabase
      .from('inventory_items')
      .update({
        current_stock: Math.max(0, Number(data.current_stock) + delta),
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
  }

  // ── submit handlers ───────────────────────────────────────

  async function handleDelivery(e) {
    e.preventDefault(); setBusy(true)
    try {
      const { error } = await supabase.from('deliveries').insert({
        item_id:       delForm.item_id,
        supplier:      delForm.supplier,
        quantity:      Number(delForm.quantity),
        delivered_by:  profile?.full_name ?? '',
        received_by:   session?.user?.id ?? null,
        delivery_date: delForm.delivery_date,
        notes:         delForm.notes || null,
      })
      if (error) throw error
      await shiftStock(delForm.item_id, Number(delForm.quantity))
      flash('Delivery logged')
      setDelForm({ item_id: '', supplier: '', quantity: '', delivery_date: todayStr(), notes: '' })
      fetchItems()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function handleRequisition(e) {
    e.preventDefault(); setBusy(true)
    try {
      const { error } = await supabase.from('requisitions').insert({
        item_id:      reqForm.item_id,
        department:   reqForm.department,
        quantity:     Number(reqForm.quantity),
        requested_by: session?.user?.id,
        status:       'pending',
      })
      if (error) throw error
      flash('Requisition submitted')
      setReqForm({ item_id: '', department: '', quantity: '' })
      fetchReqs()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function approveReq(req) {
    try {
      await shiftStock(req.item_id, -Number(req.quantity))
      const { error } = await supabase.from('requisitions').update({
        status:      'approved',
        approved_by: session?.user?.id,
        approved_at: new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      }).eq('id', req.id)
      if (error) throw error
      flash('Requisition approved')
      fetchReqs()
      fetchItems()
    } catch (err) { flash(err.message, false) }
  }

  async function rejectReq(req) {
    try {
      const { error } = await supabase.from('requisitions').update({
        status:     'rejected',
        updated_at: new Date().toISOString(),
      }).eq('id', req.id)
      if (error) throw error
      flash('Requisition rejected')
      fetchReqs()
    } catch (err) { flash(err.message, false) }
  }

  async function handleTransfer(e) {
    e.preventDefault(); setBusy(true)
    try {
      const { error } = await supabase.from('stock_transfers').insert({
        item_id:         trxForm.item_id,
        from_department: trxForm.from_department,
        to_department:   trxForm.to_department,
        quantity:        Number(trxForm.quantity),
        transferred_by:  session?.user?.id ?? null,
        status:          'completed',
        notes:           trxForm.notes || null,
      })
      if (error) throw error
      await shiftStock(trxForm.item_id, -Number(trxForm.quantity))
      flash('Transfer recorded')
      setTrxForm({ item_id: '', from_department: '', to_department: '', quantity: '', notes: '' })
      fetchItems()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function handleAdjustment(e) {
    e.preventDefault(); setBusy(true)
    try {
      const { error } = await supabase.from('stock_adjustments').insert({
        item_id:         adjForm.item_id,
        adjustment_type: adjForm.adjustment_type,
        quantity:        Number(adjForm.quantity),
        reason:          adjForm.reason || null,
        adjusted_by:     session?.user?.id,
      })
      if (error) throw error
      await shiftStock(adjForm.item_id, -Number(adjForm.quantity))
      flash('Adjustment recorded')
      setAdjForm({ item_id: '', adjustment_type: 'spoilt', quantity: '', reason: '' })
      fetchItems()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  // ── derived ───────────────────────────────────────────────

  const depts = [...new Set(items.map(i => i.department).filter(Boolean))].sort()
  const visibleItems = deptFilter === 'all' ? items : items.filter(i => i.department === deptFilter)

  // ── render ────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-gray-900">Inventory</h1>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto bg-gray-100 p-1 rounded-xl w-fit max-w-full">
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

        {/* ── Stock Levels ──────────────────────────────── */}
        {tab === 'stock' && (
          <div className="p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-base font-semibold text-gray-800">Current Stock</h2>
              <select
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              >
                <option value="all">All Departments</option>
                {depts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <Th>Item Name</Th><Th>Department</Th><Th>Unit</Th>
                    <Th>Current Stock</Th><Th>Reorder Level</Th><Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map(item => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <Td bold>{item.name}</Td>
                      <Td>{item.department}</Td>
                      <Td>{item.unit}</Td>
                      <Td bold>{item.current_stock}</Td>
                      <Td>{item.reorder_level}</Td>
                      <td className="px-4 py-3"><StockBadge item={item} /></td>
                    </tr>
                  ))}
                  {visibleItems.length === 0 && <EmptyRow cols={6} msg="No items found" />}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Log Delivery ──────────────────────────────── */}
        {tab === 'delivery' && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-5">Log Delivery</h2>
            <form onSubmit={handleDelivery} className="space-y-4 max-w-md">
              <Field label="Item">
                <Sel required value={delForm.item_id} onChange={e => setDelForm(f => ({ ...f, item_id: e.target.value }))}>
                  <option value="">Select item…</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </Sel>
              </Field>
              <Field label="Supplier">
                <Inp
                  required
                  value={delForm.supplier}
                  onChange={e => setDelForm(f => ({ ...f, supplier: e.target.value }))}
                  placeholder="Supplier name"
                />
              </Field>
              <Field label="Quantity">
                <Inp
                  type="number" required min="0.01" step="any"
                  value={delForm.quantity}
                  onChange={e => setDelForm(f => ({ ...f, quantity: e.target.value }))}
                />
              </Field>
              <Field label="Received By">
                <Inp disabled value={profile?.full_name ?? '—'} />
              </Field>
              <Field label="Date">
                <Inp
                  type="date" required
                  value={delForm.delivery_date}
                  onChange={e => setDelForm(f => ({ ...f, delivery_date: e.target.value }))}
                />
              </Field>
              <Field label="Notes (optional)">
                <textarea
                  rows={2} className={fieldCls} placeholder="Any notes…"
                  value={delForm.notes}
                  onChange={e => setDelForm(f => ({ ...f, notes: e.target.value }))}
                />
              </Field>
              <SaveBtn busy={busy} label="Log Delivery" />
            </form>
          </div>
        )}

        {/* ── Requisitions ──────────────────────────────── */}
        {tab === 'requisitions' && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-5">Raise Requisition</h2>
            <form onSubmit={handleRequisition} className="space-y-4 max-w-md mb-8">
              <Field label="Item">
                <Sel required value={reqForm.item_id} onChange={e => setReqForm(f => ({ ...f, item_id: e.target.value }))}>
                  <option value="">Select item…</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.current_stock} {i.unit})</option>
                  ))}
                </Sel>
              </Field>
              <Field label="Department">
                <Inp
                  required
                  value={reqForm.department}
                  onChange={e => setReqForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="e.g. Bar, Restaurant"
                />
              </Field>
              <Field label="Quantity">
                <Inp
                  type="number" required min="0.01" step="any"
                  value={reqForm.quantity}
                  onChange={e => setReqForm(f => ({ ...f, quantity: e.target.value }))}
                />
              </Field>
              <Field label="Requested By">
                <Inp disabled value={profile?.full_name ?? '—'} />
              </Field>
              <SaveBtn busy={busy} label="Submit Requisition" busyLabel="Submitting…" />
            </form>

            <div className="border-t border-gray-100 pt-6">
              <h2 className="text-base font-semibold text-gray-800 mb-3">All Requisitions</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <Th>Item</Th><Th>Department</Th><Th>Qty</Th>
                      <Th>Requested By</Th><Th>Date</Th><Th>Status</Th><Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {reqs.map(r => (
                      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <Td bold>{r.inventory_items?.name}</Td>
                        <Td>{r.department}</Td>
                        <Td>{r.quantity}</Td>
                        <Td>{r.requester?.full_name}</Td>
                        <Td>{fmtDate(r.created_at)}</Td>
                        <td className="px-4 py-3"><ReqBadge status={r.status} /></td>
                        <td className="px-4 py-3">
                          {r.status === 'pending' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => approveReq(r)}
                                className="text-xs font-medium px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => rejectReq(r)}
                                className="text-xs font-medium px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {reqs.length === 0 && <EmptyRow cols={7} msg="No requisitions yet" />}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Transfers ─────────────────────────────────── */}
        {tab === 'transfers' && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-5">Record Transfer</h2>
            <form onSubmit={handleTransfer} className="space-y-4 max-w-md">
              <Field label="Item">
                <Sel required value={trxForm.item_id} onChange={e => setTrxForm(f => ({ ...f, item_id: e.target.value }))}>
                  <option value="">Select item…</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.current_stock} {i.unit})</option>
                  ))}
                </Sel>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="From Department">
                  <Inp
                    required
                    value={trxForm.from_department}
                    onChange={e => setTrxForm(f => ({ ...f, from_department: e.target.value }))}
                    placeholder="e.g. Store"
                  />
                </Field>
                <Field label="To Department">
                  <Inp
                    required
                    value={trxForm.to_department}
                    onChange={e => setTrxForm(f => ({ ...f, to_department: e.target.value }))}
                    placeholder="e.g. Bar"
                  />
                </Field>
              </div>
              <Field label="Quantity">
                <Inp
                  type="number" required min="0.01" step="any"
                  value={trxForm.quantity}
                  onChange={e => setTrxForm(f => ({ ...f, quantity: e.target.value }))}
                />
              </Field>
              <Field label="Transferred By">
                <Inp disabled value={profile?.full_name ?? '—'} />
              </Field>
              <Field label="Notes (optional)">
                <textarea
                  rows={2} className={fieldCls}
                  value={trxForm.notes}
                  onChange={e => setTrxForm(f => ({ ...f, notes: e.target.value }))}
                />
              </Field>
              <SaveBtn busy={busy} label="Record Transfer" />
            </form>
          </div>
        )}

        {/* ── Adjustments ───────────────────────────────── */}
        {tab === 'adjustments' && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-5">Stock Adjustment</h2>
            <form onSubmit={handleAdjustment} className="space-y-4 max-w-md">
              <Field label="Item">
                <Sel required value={adjForm.item_id} onChange={e => setAdjForm(f => ({ ...f, item_id: e.target.value }))}>
                  <option value="">Select item…</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.current_stock} {i.unit})</option>
                  ))}
                </Sel>
              </Field>
              <Field label="Reason">
                <Sel required value={adjForm.adjustment_type} onChange={e => setAdjForm(f => ({ ...f, adjustment_type: e.target.value }))}>
                  {ADJ_TYPES.map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </Sel>
              </Field>
              <Field label="Quantity">
                <Inp
                  type="number" required min="0.01" step="any"
                  value={adjForm.quantity}
                  onChange={e => setAdjForm(f => ({ ...f, quantity: e.target.value }))}
                />
              </Field>
              <Field label="Notes">
                <textarea
                  rows={2} className={fieldCls} placeholder="Describe the adjustment…"
                  value={adjForm.reason}
                  onChange={e => setAdjForm(f => ({ ...f, reason: e.target.value }))}
                />
              </Field>
              <Field label="Recorded By">
                <Inp disabled value={profile?.full_name ?? '—'} />
              </Field>
              <SaveBtn busy={busy} label="Record Adjustment" />
            </form>
          </div>
        )}

        {/* ── Delivery Log ──────────────────────────────── */}
        {tab === 'log' && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Delivery Log</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <Th>Item Name</Th><Th>Supplier</Th><Th>Quantity</Th>
                    <Th>Received By</Th><Th>Date</Th><Th>Notes</Th>
                  </tr>
                </thead>
                <tbody>
                  {delLog.map(d => (
                    <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <Td bold>{d.inventory_items?.name}</Td>
                      <Td>{d.supplier}</Td>
                      <Td>{d.quantity}</Td>
                      <Td>{d.delivered_by}</Td>
                      <Td>{fmtDate(d.delivery_date)}</Td>
                      <Td>{d.notes}</Td>
                    </tr>
                  ))}
                  {delLog.length === 0 && <EmptyRow cols={6} msg="No deliveries logged yet" />}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
