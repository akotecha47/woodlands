import { useState, useEffect } from 'react'
import { Lock } from 'lucide-react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Th, Td, Toast, useFlash } from '../admin/AdminUI'

const STATUS_BADGE = {
  pending:   'bg-gray-100 text-gray-500',
  deducted:  'bg-blue-100 text-blue-700',
  cleared:   'bg-green-100 text-green-700',
  returned:  'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-600',
}

const BLANK = { stock_item_id: '', quantity: '' }

export default function EventStockSection({ eventId, eventStatus, canManage, onRefresh }) {
  const { session } = useAuth()
  const [allocations,   setAllocations]   = useState([])
  const [stockItems,    setStockItems]    = useState([])
  const [form,          setForm]          = useState(BLANK)
  const [clearanceForm, setClearanceForm] = useState({})
  const [busy,          setBusy]          = useState(false)
  const [clearBusy,     setClearBusy]     = useState(false)
  const [toast,         setToast]         = useState(null)
  const flash = useFlash(setToast)

  async function loadAllocations() {
    const { data } = await supabaseAdmin
      .from('event_stock_allocations')
      .select('*, stock_items(id, name, sku, unit, department)')
      .eq('event_id', eventId)
      .order('created_at')
    const rows = data ?? []
    setAllocations(rows)
    // Pre-fill clearance form with allocated_qty as starting point
    const cf = {}
    for (const a of rows) {
      if (a.status === 'deducted') cf[a.id] = String(a.allocated_qty)
    }
    setClearanceForm(cf)
  }

  async function loadStockItems() {
    const { data } = await supabaseAdmin
      .from('stock_items')
      .select('id, name, sku, unit, department, current_stock(quantity)')
      .eq('is_active', true)
      .order('department').order('name')
    setStockItems(data ?? [])
  }

  useEffect(() => {
    loadAllocations()
    if (canManage) loadStockItems()
  }, [eventId])

  const allocatedIds   = new Set(allocations.map(a => a.stock_item_id))
  const availableItems = stockItems.filter(s => !allocatedIds.has(s.id))
  const selectedItem   = stockItems.find(s => s.id === form.stock_item_id) ?? null
  const canAddMore     = canManage && ['enquiry', 'confirmed'].includes(eventStatus)

  async function handleAdd(e) {
    e.preventDefault()
    const qty = Number(form.quantity)
    if (!form.stock_item_id)  { flash('Select a stock item', false); return }
    if (!qty || qty <= 0)     { flash('Quantity must be greater than 0', false); return }
    const avail = selectedItem?.current_stock?.[0]?.quantity ?? 0
    if (selectedItem && qty > avail) {
      flash(`Only ${avail} ${selectedItem.unit} available`, false)
      return
    }
    setBusy(true)
    try {
      const { error } = await supabaseAdmin.from('event_stock_allocations').insert({
        event_id:      eventId,
        stock_item_id: form.stock_item_id,
        allocated_qty: qty,
        created_by:    session?.user?.id ?? null,
      })
      if (error) throw error
      setForm(BLANK)
      loadAllocations()
      onRefresh()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function handleRemove(alloc) {
    try {
      const { error } = await supabaseAdmin.from('event_stock_allocations').delete().eq('id', alloc.id)
      if (error) throw error
      loadAllocations()
      onRefresh()
    } catch (err) { flash(err.message, false) }
  }

  async function handleClearance(e) {
    e.preventDefault()
    const toClear = allocations.filter(a => a.status === 'deducted')
    // Validate before touching anything
    for (const a of toClear) {
      const consumed = Number(clearanceForm[a.id] ?? 0)
      if (consumed < 0 || consumed > a.allocated_qty) {
        flash(
          `Consumed qty for ${a.stock_items?.name} must be 0 – ${a.allocated_qty} ${a.stock_items?.unit ?? ''}`,
          false
        )
        return
      }
    }
    setClearBusy(true)
    try {
      for (const a of toClear) {
        const consumed = Number(clearanceForm[a.id] ?? 0)
        const returned = Math.max(0, a.allocated_qty - consumed)
        // Return surplus to stock
        const { data: cs } = await supabaseAdmin
          .from('current_stock').select('quantity').eq('stock_item_id', a.stock_item_id).single()
        if (cs) {
          await supabaseAdmin.from('current_stock')
            .update({ quantity: (cs.quantity ?? 0) + returned, last_updated: new Date().toISOString() })
            .eq('stock_item_id', a.stock_item_id)
        }
        // Mark cleared
        await supabaseAdmin.from('event_stock_allocations').update({
          consumed_qty: consumed,
          status:       'cleared',
          cleared_at:   new Date().toISOString(),
        }).eq('id', a.id)
      }
      flash('Clearance complete — stock returned')
      loadAllocations()
      onRefresh()
    } catch (err) { flash(err.message, false) }
    finally { setClearBusy(false) }
  }

  const deductedAllocations  = allocations.filter(a => a.status === 'deducted')
  const clearedAllocations   = allocations.filter(a => a.status === 'cleared')
  const showClearanceSummary = deductedAllocations.length === 0 && clearedAllocations.length > 0

  return (
    <div>
      <Toast toast={toast} />
      <h3 className="text-base font-semibold text-gray-800 mb-4">Stock Allocations</h3>

      {/* Allocations table */}
      {allocations.length > 0 ? (
        <div className="overflow-x-auto mb-4 border border-gray-200 rounded-xl">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <Th>Item</Th>
                <Th>SKU</Th>
                <Th>Dept</Th>
                <Th>Allocated</Th>
                <Th>Consumed</Th>
                <Th>Returned</Th>
                <Th>Status</Th>
                {canManage && <th className="px-4 py-3 w-10" />}
              </tr>
            </thead>
            <tbody>
              {allocations.map(a => {
                const item = a.stock_items
                const unit = item?.unit ?? ''
                return (
                  <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{item?.name ?? '—'}</td>
                    <Td>{item?.sku}</Td>
                    <Td>{item?.department}</Td>
                    <Td>{a.allocated_qty} {unit}</Td>
                    <Td>{a.consumed_qty != null ? `${a.consumed_qty} ${unit}` : null}</Td>
                    <Td>{a.returned_qty != null ? `${a.returned_qty} ${unit}` : null}</Td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_BADGE[a.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {a.status}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        {a.status === 'pending' ? (
                          <button
                            onClick={() => handleRemove(a)}
                            title="Remove allocation"
                            className="text-red-400 hover:text-red-600 transition-colors text-lg leading-none font-medium"
                          >
                            ×
                          </button>
                        ) : (
                          <Lock size={12} className="text-gray-300" title="Locked after confirmation" />
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-4">No stock allocated yet.</p>
      )}

      {/* Add allocation form — enquiry or confirmed only */}
      {canAddMore && (
        <div className="border border-gray-200 rounded-xl p-4 mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Add to Allocation</h4>
          <form onSubmit={handleAdd} className="space-y-3">
            <Field label="Stock Item *">
              <Sel
                required
                value={form.stock_item_id}
                onChange={e => setForm(f => ({ ...f, stock_item_id: e.target.value, quantity: '' }))}
              >
                <option value="">— Select item —</option>
                {availableItems.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.sku} ({s.department}) · {s.current_stock?.[0]?.quantity ?? 0} {s.unit} available
                  </option>
                ))}
              </Sel>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity *">
                <Inp
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="0"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                />
              </Field>
              {selectedItem && (
                <Field label="Unit">
                  <div className="flex items-center h-[38px] px-3 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg">
                    {selectedItem.unit}
                  </div>
                </Field>
              )}
            </div>
            {selectedItem && form.quantity && Number(form.quantity) > (selectedItem.current_stock?.[0]?.quantity ?? 0) && (
              <p className="text-xs text-red-600">
                Only {selectedItem.current_stock?.[0]?.quantity ?? 0} {selectedItem.unit} available
              </p>
            )}
            <button type="submit" disabled={busy}
              className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
              {busy ? 'Adding…' : 'Add to Allocation'}
            </button>
          </form>
        </div>
      )}

      {/* Post-event clearance — only when completed and there's something to clear or summarise */}
      {eventStatus === 'completed' && (deductedAllocations.length > 0 || showClearanceSummary) && (
        <div className="border border-gray-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Post-Event Stock Clearance</h4>

          {showClearanceSummary ? (
            /* Read-only summary once all cleared */
            <div>
              <p className="text-xs text-gray-400 mb-3">Clearance complete.</p>
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <Th>Item</Th>
                      <Th>Dept</Th>
                      <Th>Allocated</Th>
                      <Th>Consumed</Th>
                      <Th>Returned</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {clearedAllocations.map(a => {
                      const item = a.stock_items
                      const unit = item?.unit ?? ''
                      return (
                        <tr key={a.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{item?.name ?? '—'}</td>
                          <Td>{item?.department}</Td>
                          <Td>{a.allocated_qty} {unit}</Td>
                          <Td>{a.consumed_qty} {unit}</Td>
                          <Td>{a.returned_qty} {unit}</Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Editable clearance form */
            <form onSubmit={handleClearance} className="space-y-3">
              <p className="text-xs text-gray-500">
                Enter actual quantities consumed. Unused stock will be returned automatically.
              </p>
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <Th>Item</Th>
                      <Th>Allocated</Th>
                      <Th>Consumed</Th>
                      <Th>Returned (auto)</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {deductedAllocations.map(a => {
                      const item     = a.stock_items
                      const unit     = item?.unit ?? ''
                      const consumed = Number(clearanceForm[a.id] ?? a.allocated_qty)
                      const returned = Math.max(0, a.allocated_qty - consumed)
                      return (
                        <tr key={a.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{item?.name ?? '—'}</td>
                          <Td>{a.allocated_qty} {unit}</Td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                max={a.allocated_qty}
                                step="0.01"
                                value={clearanceForm[a.id] ?? a.allocated_qty}
                                onChange={e => setClearanceForm(cf => ({ ...cf, [a.id]: e.target.value }))}
                                className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                              />
                              <span className="text-xs text-gray-500">{unit}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-600">
                            {returned} {unit}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <button type="submit" disabled={clearBusy}
                className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
                {clearBusy ? 'Processing…' : 'Complete Clearance'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
