import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { UNITS } from '../../lib/constants'
import { Field, Inp, Sel, Th, Td, Toast, useFlash } from './AdminUI'

const DEPT_CODES = {
  'Kitchen':         'KIT',
  'Restaurant Bar':  'RBA',
  'Sports Bar':      'SBA',
  'Restaurant':      'RST',
  'Housekeeping':    'HSK',
  'Grounds':         'GRD',
  'Security':        'SEC',
}

function deptCode(dept) { return DEPT_CODES[dept] ?? 'GEN' }

function defaultUnit(dept) {
  if (!dept) return 'units'
  if (dept === 'Kitchen' || dept === 'Restaurant') return 'kg'
  if (dept.toLowerCase().includes('bar')) return 'litres'
  return 'units'
}

export default function StockItemsTab() {
  const [stockItems,   setStockItems]   = useState([])
  const [departments,  setDepartments]  = useState([])
  const [busyId,       setBusyId]       = useState(null)
  const [editingStock, setEditingStock] = useState(null) // { id, name, unit, reorder_level }
  const [stockForm,    setStockForm]    = useState({ name: '', unit: 'units', department: '', reorder_level: 0 })
  const [stockBusy,    setStockBusy]    = useState(false)
  const [toast,        setToast]        = useState(null)
  const flash = useFlash(setToast)

  async function fetchStockItems() {
    const { data } = await supabaseAdmin.from('stock_items').select('*').order('name')
    if (data) setStockItems(data)
  }

  async function fetchDepartments() {
    const { data } = await supabaseAdmin.from('departments').select('*').order('name')
    if (data) setDepartments(data)
  }

  async function addStockItem(e) {
    e.preventDefault()
    setStockBusy(true)
    try {
      const dept = stockForm.department || null
      let countQuery = supabaseAdmin.from('stock_items').select('*', { count: 'exact', head: true })
      countQuery = dept ? countQuery.eq('department', dept) : countQuery.is('department', null)
      const { count } = await countQuery
      const sku = `${deptCode(dept)}-${String((count ?? 0) + 1).padStart(3, '0')}`

      const { error } = await supabaseAdmin.from('stock_items').insert({
        name: stockForm.name.trim(),
        sku,
        unit: stockForm.unit,
        department: dept,
        reorder_level: Number(stockForm.reorder_level),
      })
      if (error) throw error
      setStockForm({ name: '', unit: 'units', department: '', reorder_level: 0 })
      await fetchStockItems()
      flash(`Stock item added (SKU: ${sku})`)
    } catch (err) { flash(err.message, false) }
    finally { setStockBusy(false) }
  }

  async function toggleStockActive(item) {
    setBusyId(item.id)
    try {
      const { error } = await supabaseAdmin
        .from('stock_items')
        .update({ is_active: !item.is_active })
        .eq('id', item.id)
      if (error) throw error
      flash(`"${item.name}" ${item.is_active ? 'deactivated' : 'reactivated'}`)
      await fetchStockItems()
    } catch (err) { flash(err.message, false) }
    finally { setBusyId(null) }
  }

  async function saveStockEdit() {
    const { id, name, unit, reorder_level } = editingStock
    if (!name.trim()) return
    try {
      const { error } = await supabaseAdmin
        .from('stock_items')
        .update({ name: name.trim(), unit, reorder_level: Number(reorder_level) })
        .eq('id', id)
      if (error) throw error
      setEditingStock(null)
      await fetchStockItems()
      flash('Item updated')
    } catch (err) { flash(err.message, false) }
  }

  useEffect(() => { fetchStockItems(); fetchDepartments() }, [])

  return (
    <div className="p-6 space-y-5">
      <Toast toast={toast} />
      <h2 className="text-base font-semibold text-gray-800">Stock Items</h2>

      <form onSubmit={addStockItem} className="grid grid-cols-2 gap-3 max-w-2xl">
        <Field label="Name *">
          <Inp
            required
            value={stockForm.name}
            onChange={e => setStockForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Item name"
          />
        </Field>
        <Field label="Department">
          <Sel
            value={stockForm.department}
            onChange={e => {
              const dept = e.target.value
              setStockForm(f => ({ ...f, department: dept, unit: defaultUnit(dept) }))
            }}>
            <option value="">— None —</option>
            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </Sel>
        </Field>
        <Field label="Unit *">
          <Sel
            required
            value={stockForm.unit}
            onChange={e => setStockForm(f => ({ ...f, unit: e.target.value }))}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </Sel>
        </Field>
        <Field label="Reorder Level">
          <Inp
            type="number"
            min={0}
            value={stockForm.reorder_level}
            onChange={e => setStockForm(f => ({ ...f, reorder_level: e.target.value }))}
          />
        </Field>
        <div className="col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={stockBusy}
            className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
            {stockBusy ? 'Adding…' : 'Add Item'}
          </button>
          <span className="text-xs text-gray-400">SKU auto-generated on save</span>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Name</Th>
              <Th>SKU</Th>
              <Th>Unit</Th>
              <Th>Department</Th>
              <Th>Reorder Level</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {stockItems.map(item => {
              const editing = editingStock?.id === item.id
              const busy    = busyId === item.id
              return (
                <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {editing
                      ? <Inp value={editingStock.name} onChange={e => setEditingStock(s => ({ ...s, name: e.target.value }))} />
                      : <span className="font-medium">{item.name}</span>}
                  </td>
                  <Td>{item.sku}</Td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {editing
                      ? <Sel value={editingStock.unit} onChange={e => setEditingStock(s => ({ ...s, unit: e.target.value }))}>
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </Sel>
                      : item.unit}
                  </td>
                  <Td>{item.department}</Td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {editing
                      ? <Inp type="number" min={0} value={editingStock.reorder_level} onChange={e => setEditingStock(s => ({ ...s, reorder_level: e.target.value }))} />
                      : item.reorder_level}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {editing ? (
                        <>
                          <button
                            onClick={saveStockEdit}
                            className="px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                            Save
                          </button>
                          <button
                            onClick={() => setEditingStock(null)}
                            className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditingStock({ id: item.id, name: item.name, unit: item.unit, reorder_level: item.reorder_level })}
                            className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">
                            Edit
                          </button>
                          <button
                            onClick={() => toggleStockActive(item)}
                            disabled={busy}
                            className={`px-3 py-1 text-xs font-medium rounded-lg disabled:opacity-60 transition-colors ${
                              item.is_active
                                ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                                : 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200'
                            }`}>
                            {busy ? '…' : item.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {stockItems.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No stock items yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
