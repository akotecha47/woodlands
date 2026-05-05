import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Shared ───────────────────────────────────────────────────────────────────

function Badge({ variant, children }) {
  const cls = {
    green: 'bg-green-100 text-green-700',
    red:   'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
  }[variant]
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  )
}

function Alert({ variant, children }) {
  const cls = variant === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-green-50 border-green-200 text-green-700'
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>
  )
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 ' +
  'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]'

const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

const submitBtnCls =
  'w-full rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-medium text-white ' +
  'hover:bg-[#15803d] focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50 ' +
  'disabled:opacity-50 transition-colors'

const thCls =
  'whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500'

const tdCls = 'px-4 py-3'

// ─── Tab 1: Stock Levels ──────────────────────────────────────────────────────

function StockLevels({ items, departments, loading }) {
  const [deptFilter, setDeptFilter] = useState('')

  const filtered = deptFilter
    ? items.filter(i => String(i.department_id) === deptFilter)
    : items

  return (
    <div className="space-y-4">
      <div>
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]"
        >
          <option value="">All Departments</option>
          {departments.map(d => (
            <option key={d.id} value={String(d.id)}>{d.name}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Item Name', 'Department', 'Unit', 'Current Stock', 'Reorder Level', 'Status'].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">No items found.</td>
              </tr>
            ) : filtered.map(item => {
              const low = item.current_stock <= item.reorder_level
              return (
                <tr key={item.id} className="hover:bg-gray-50/60">
                  <td className={`${tdCls} font-medium text-gray-900`}>{item.name}</td>
                  <td className={`${tdCls} text-gray-600`}>{item.departments?.name ?? '—'}</td>
                  <td className={`${tdCls} text-gray-600`}>{item.unit}</td>
                  <td className={`${tdCls} tabular-nums text-gray-900`}>{item.current_stock}</td>
                  <td className={`${tdCls} tabular-nums text-gray-600`}>{item.reorder_level}</td>
                  <td className={tdCls}>
                    <Badge variant={low ? 'red' : 'green'}>{low ? 'Low Stock' : 'OK'}</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Tab 2: Log Delivery ──────────────────────────────────────────────────────

const today = new Date().toISOString().split('T')[0]
const deliveryDefaults = { itemId: '', supplier: '', quantity: '', receivedBy: '', date: today }

function LogDelivery({ items, onStockUpdated }) {
  const [form, setForm] = useState(deliveryDefaults)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(false)

    const qty = Number(form.quantity)

    const { error: insertErr } = await supabase.from('deliveries').insert({
      item_id:     form.itemId,
      supplier:    form.supplier,
      quantity:    qty,
      received_by: form.receivedBy,
      date:        form.date,
    })

    if (insertErr) { setError(insertErr.message); setSubmitting(false); return }

    const { data: current, error: fetchErr } = await supabase
      .from('inventory_items')
      .select('current_stock')
      .eq('id', form.itemId)
      .single()

    if (fetchErr) { setError(fetchErr.message); setSubmitting(false); return }

    const { error: updateErr } = await supabase
      .from('inventory_items')
      .update({ current_stock: current.current_stock + qty })
      .eq('id', form.itemId)

    if (updateErr) { setError(updateErr.message); setSubmitting(false); return }

    setSuccess(true)
    setForm(deliveryDefaults)
    setSubmitting(false)
    onStockUpdated()
  }

  return (
    <div className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900">Log a Delivery</h2>

        {success && <Alert variant="success">Delivery logged and stock updated successfully.</Alert>}
        {error   && <Alert variant="error">{error}</Alert>}

        <div>
          <label className={labelCls}>Item</label>
          <select required value={form.itemId} onChange={set('itemId')} className={inputCls}>
            <option value="">Select item…</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Supplier</label>
          <input
            required type="text" value={form.supplier}
            onChange={set('supplier')} placeholder="Supplier name"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Quantity</label>
            <input
              required type="number" min="1" value={form.quantity}
              onChange={set('quantity')} placeholder="0"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input required type="date" value={form.date} onChange={set('date')} className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Received By</label>
          <input
            required type="text" value={form.receivedBy}
            onChange={set('receivedBy')} placeholder="Staff name"
            className={inputCls}
          />
        </div>

        <button type="submit" disabled={submitting} className={submitBtnCls}>
          {submitting ? 'Logging…' : 'Log Delivery'}
        </button>
      </form>
    </div>
  )
}

// ─── Tab 3: Requisitions ──────────────────────────────────────────────────────

const reqDefaults = { itemId: '', departmentId: '', quantity: '', requestedBy: '' }

function Requisitions({ items, departments, onStockUpdated }) {
  const [form, setForm] = useState(reqDefaults)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [list, setList] = useState([])
  const [listLoading, setListLoading] = useState(true)

  const fetchList = useCallback(async () => {
    setListLoading(true)
    const { data } = await supabase
      .from('requisitions')
      .select('*, inventory_items(name), departments(name)')
      .order('created_at', { ascending: false })
    setList(data ?? [])
    setListLoading(false)
  }, [])

  useEffect(() => { fetchList() }, [fetchList])

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(false)

    const qty = Number(form.quantity)

    const { error: insertErr } = await supabase.from('requisitions').insert({
      item_id:       form.itemId,
      department_id: form.departmentId,
      quantity:      qty,
      requested_by:  form.requestedBy,
      status:        'pending',
    })

    if (insertErr) { setError(insertErr.message); setSubmitting(false); return }

    const { data: current, error: fetchErr } = await supabase
      .from('inventory_items')
      .select('current_stock')
      .eq('id', form.itemId)
      .single()

    if (fetchErr) { setError(fetchErr.message); setSubmitting(false); return }

    const { error: updateErr } = await supabase
      .from('inventory_items')
      .update({ current_stock: Math.max(0, current.current_stock - qty) })
      .eq('id', form.itemId)

    if (updateErr) { setError(updateErr.message); setSubmitting(false); return }

    setSuccess(true)
    setForm(reqDefaults)
    setSubmitting(false)
    fetchList()
    onStockUpdated()
  }

  const statusVariant = s => s === 'approved' ? 'green' : 'amber'

  return (
    <div className="space-y-6">
      <div className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold text-gray-900">Raise a Requisition</h2>

          {success && <Alert variant="success">Requisition submitted and stock updated.</Alert>}
          {error   && <Alert variant="error">{error}</Alert>}

          <div>
            <label className={labelCls}>Item</label>
            <select required value={form.itemId} onChange={set('itemId')} className={inputCls}>
              <option value="">Select item…</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>Department</label>
            <select required value={form.departmentId} onChange={set('departmentId')} className={inputCls}>
              <option value="">Select department…</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Quantity</label>
              <input
                required type="number" min="1" value={form.quantity}
                onChange={set('quantity')} placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Requested By</label>
              <input
                required type="text" value={form.requestedBy}
                onChange={set('requestedBy')} placeholder="Staff name"
                className={inputCls}
              />
            </div>
          </div>

          <button type="submit" disabled={submitting} className={submitBtnCls}>
            {submitting ? 'Submitting…' : 'Submit Requisition'}
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Item', 'Department', 'Qty', 'Requested By', 'Status'].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {listLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">Loading…</td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">No requisitions yet.</td>
              </tr>
            ) : list.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/60">
                <td className={`${tdCls} font-medium text-gray-900`}>{r.inventory_items?.name ?? '—'}</td>
                <td className={`${tdCls} text-gray-600`}>{r.departments?.name ?? '—'}</td>
                <td className={`${tdCls} tabular-nums text-gray-900`}>{r.quantity}</td>
                <td className={`${tdCls} text-gray-600`}>{r.requested_by}</td>
                <td className={tdCls}>
                  <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Tab 4: Delivery Log ─────────────────────────────────────────────────────

function DeliveryLog() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      setLoading(true)
      const { data } = await supabase
        .from('deliveries')
        .select('*, inventory_items(name)')
        .order('created_at', { ascending: false })
      if (cancelled) return
      setList(data ?? [])
      setLoading(false)
    }

    fetch()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {['Item Name', 'Supplier', 'Quantity', 'Received By', 'Date'].map(h => (
              <th key={h} className={thCls}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-gray-400">Loading…</td>
            </tr>
          ) : list.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-gray-400">No deliveries logged yet.</td>
            </tr>
          ) : list.map(d => (
            <tr key={d.id} className="hover:bg-gray-50/60">
              <td className={`${tdCls} font-medium text-gray-900`}>{d.inventory_items?.name ?? '—'}</td>
              <td className={`${tdCls} text-gray-600`}>{d.supplier}</td>
              <td className={`${tdCls} tabular-nums text-gray-900`}>{d.quantity}</td>
              <td className={`${tdCls} text-gray-600`}>{d.received_by}</td>
              <td className={`${tdCls} text-gray-600`}>{d.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = ['Stock Levels', 'Log Delivery', 'Requisitions', 'Delivery Log']

export default function Inventory() {
  const [tab, setTab] = useState(0)
  const [items, setItems] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from('inventory_items')
      .select('*, departments(name)')
      .order('name')
    if (data) setItems(data)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)
      const [{ data: depts }, { data: inv }] = await Promise.all([
        supabase.from('departments').select('*').order('name'),
        supabase.from('inventory_items').select('*, departments(name)').order('name'),
      ])
      if (cancelled) return
      if (depts) setDepartments(depts)
      if (inv) setItems(inv)
      setLoading(false)
    }

    init()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Inventory</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage stock levels, log deliveries, and track requisitions.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={[
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === i
                ? 'border-[#16a34a] text-[#16a34a]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 0 && (
        <StockLevels items={items} departments={departments} loading={loading} />
      )}
      {tab === 1 && (
        <LogDelivery items={items} onStockUpdated={fetchItems} />
      )}
      {tab === 2 && (
        <Requisitions items={items} departments={departments} onStockUpdated={fetchItems} />
      )}
      {tab === 3 && (
        <DeliveryLog />
      )}
    </div>
  )
}
