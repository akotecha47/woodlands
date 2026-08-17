import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Th, Td, Toast, useFlash } from '../admin/AdminUI'
import { EmptyRow, TdBold, StockBadge, fetchDepartmentList } from './InventoryUI'
import { stockLocations } from '../../lib/constants'

export default function StockLevelsTab() {
  const [rows,        setRows]        = useState([])
  const [locations,   setLocations]   = useState([])
  const [locFilter,   setLocFilter]   = useState('')
  const [toast,       setToast]       = useState(null)
  const flash = useFlash(setToast)

  // Two-tier (migration 051): balances are per (item, location), so an item
  // appears once per location it is held at — main store AND each department.
  // This is the one screen that deliberately shows both tiers; every other
  // current_stock reader filters to tier='department'.
  async function fetchStock() {
    const { data, error } = await supabase
      .from('current_stock')
      .select('id, quantity, location, sub_location, reorder_level, par_level, stock_items(id, name, sku, unit, reorder_level)')
    if (error) { flash(error.message, false); return }
    const flat = (data ?? [])
      .map(r => ({
        id:            r.id,            // the BALANCE row id — stock_items.id is
                                        // no longer unique across rows
        name:          r.stock_items.name,
        sku:           r.stock_items.sku,
        unit:          r.stock_items.unit,
        location:      r.sub_location ? `${r.location} → ${r.sub_location}` : r.location,
        locationKey:   r.location,
        // Per-tier threshold, falling back to the catalogue default exactly as
        // the column comment specifies.
        reorder_level: r.reorder_level ?? r.stock_items.reorder_level,
        // Par has NO catalogue fallback, unlike reorder: NULL means this
        // location is not on the end-of-day par cycle at all, which is a real
        // distinction and must not be papered over with a default (059).
        par_level:     r.par_level,
        quantity:      r.quantity,
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.locationKey.localeCompare(b.locationKey))
    setRows(flat)
  }

  useEffect(() => {
    fetchStock()
    fetchDepartmentList().then(d => setLocations(stockLocations(d)))
  }, [])

  const visible = locFilter ? rows.filter(r => r.locationKey === locFilter) : rows

  return (
    <div className="p-6">
      <Toast toast={toast} />
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-base font-semibold text-gray-800">Current Stock</h2>
        <select
          value={locFilter}
          onChange={e => setLocFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
        >
          <option value="">All Locations</option>
          {locations.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Item Name</Th><Th>SKU</Th><Th>Location</Th><Th>Unit</Th>
              <Th>Current Stock</Th><Th>Reorder Level</Th><Th>Par</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map(item => (
              <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <TdBold>{item.name}</TdBold>
                <Td>{item.sku}</Td>
                <Td>{item.location}</Td>
                <Td>{item.unit}</Td>
                <TdBold>{item.quantity}</TdBold>
                <Td>{item.reorder_level}</Td>
                <td className="px-4 py-3 text-sm">
                  {item.par_level == null
                    ? <span className="text-gray-300" title="Not on the end-of-day par cycle">—</span>
                    : <span className={Number(item.quantity) < Number(item.par_level) ? 'font-medium text-amber-700' : 'text-gray-600'}>
                        {item.par_level}
                      </span>}
                </td>
                <td className="px-4 py-3">
                  <StockBadge quantity={item.quantity} reorderLevel={item.reorder_level} />
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <EmptyRow cols={8} msg={
                rows.length === 0
                  ? 'No stock items yet. Add items in Admin → Stock Items.'
                  : 'No items at this location.'
              } />
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
