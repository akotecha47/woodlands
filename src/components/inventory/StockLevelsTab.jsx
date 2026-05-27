import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { Th, Td, Toast, useFlash } from '../admin/AdminUI'
import { EmptyRow, TdBold, StockBadge, fetchDepartmentList } from './InventoryUI'

export default function StockLevelsTab() {
  const [rows,        setRows]        = useState([])
  const [departments, setDepartments] = useState([])
  const [deptFilter,  setDeptFilter]  = useState('')
  const [toast,       setToast]       = useState(null)
  const flash = useFlash(setToast)

  async function fetchStock() {
    const { data, error } = await supabaseAdmin
      .from('current_stock')
      .select('quantity, stock_items(id, name, sku, unit, department, reorder_level)')
    if (error) { flash(error.message, false); return }
    const flat = (data ?? [])
      .map(r => ({
        id:            r.stock_items.id,
        name:          r.stock_items.name,
        sku:           r.stock_items.sku,
        unit:          r.stock_items.unit,
        department:    r.stock_items.department,
        reorder_level: r.stock_items.reorder_level,
        quantity:      r.quantity,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    setRows(flat)
  }

  useEffect(() => {
    fetchStock()
    fetchDepartmentList().then(setDepartments)
  }, [])

  const visible = deptFilter ? rows.filter(r => r.department === deptFilter) : rows

  return (
    <div className="p-6">
      <Toast toast={toast} />
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-base font-semibold text-gray-800">Current Stock</h2>
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Item Name</Th><Th>SKU</Th><Th>Department</Th><Th>Unit</Th>
              <Th>Current Stock</Th><Th>Reorder Level</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map(item => (
              <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <TdBold>{item.name}</TdBold>
                <Td>{item.sku}</Td>
                <Td>{item.department}</Td>
                <Td>{item.unit}</Td>
                <TdBold>{item.quantity}</TdBold>
                <Td>{item.reorder_level}</Td>
                <td className="px-4 py-3">
                  <StockBadge quantity={item.quantity} reorderLevel={item.reorder_level} />
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <EmptyRow cols={7} msg={
                rows.length === 0
                  ? 'No stock items yet. Add items in Admin → Stock Items.'
                  : 'No items in this department.'
              } />
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
