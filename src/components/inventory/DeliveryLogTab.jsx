import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { Th, Td, Toast, useFlash, fmtDate } from '../admin/AdminUI'
import { EmptyRow, TdBold, fetchActiveItems, fetchUserMap } from './InventoryUI'

function parseSupplier(notes) {
  if (!notes) return '—'
  const match = notes.match(/^Supplier:\s*(.+)/m)
  return match ? match[1].trim() : notes
}

export default function DeliveryLogTab() {
  const [movements,  setMovements]  = useState([])
  const [items,      setItems]      = useState([])
  const [userNames,  setUserNames]  = useState({})
  const [itemFilter, setItemFilter] = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [toast,      setToast]      = useState(null)
  const flash = useFlash(setToast)

  async function fetchMovements() {
    let q = supabaseAdmin
      .from('stock_movements')
      .select('id, quantity_change, notes, created_at, performed_by, stock_item_id, stock_items(name, sku)')
      .eq('movement_type', 'delivery')
      .order('created_at', { ascending: false })

    if (itemFilter) q = q.eq('stock_item_id', itemFilter)
    if (dateFrom)   q = q.gte('created_at', dateFrom)
    if (dateTo)     q = q.lte('created_at', dateTo + 'T23:59:59Z')

    const { data, error } = await q
    if (error) { flash(error.message, false); return }
    setMovements(data ?? [])
  }

  useEffect(() => {
    fetchActiveItems().then(setItems)
    fetchUserMap().then(setUserNames)
  }, [])

  useEffect(() => { fetchMovements() }, [itemFilter, dateFrom, dateTo])

  const hasFilter = itemFilter || dateFrom || dateTo

  return (
    <div className="p-6 space-y-4">
      <Toast toast={toast} />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="text-base font-semibold text-gray-800 mr-1">Delivery Log</h2>
        <select
          value={itemFilter}
          onChange={e => setItemFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
        >
          <option value="">All Items</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name} — {i.sku}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        <span className="text-sm text-gray-400">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        {hasFilter && (
          <button
            onClick={() => { setItemFilter(''); setDateFrom(''); setDateTo('') }}
            className="text-xs text-gray-500 hover:text-gray-700 underline">
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Date</Th><Th>Item</Th><Th>SKU</Th>
              <Th>Quantity</Th><Th>Supplier</Th><Th>Performed By</Th>
            </tr>
          </thead>
          <tbody>
            {movements.map(m => (
              <tr key={m.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <Td>{fmtDate(m.created_at)}</Td>
                <TdBold>{m.stock_items?.name}</TdBold>
                <Td>{m.stock_items?.sku}</Td>
                <Td>{m.quantity_change}</Td>
                <Td>{parseSupplier(m.notes)}</Td>
                <Td>{userNames[m.performed_by]}</Td>
              </tr>
            ))}
            {movements.length === 0 && <EmptyRow cols={6} msg="No deliveries found" />}
          </tbody>
        </table>
      </div>
    </div>
  )
}
