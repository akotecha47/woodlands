import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Th, Td, Toast } from '../admin/AdminUI'
import { Field, Sel, SearchInput, SectionHead, TableWrap, Thead } from '../ui/kit'
import { EmptyRow, TdBold, StockBadge, fetchDepartmentList } from './InventoryUI'
import { stockLocations } from '../../lib/constants'
import { useFlash } from '../ui/useFlash'

export default function StockLevelsTab() {
  const [rows,        setRows]        = useState([])
  const [locations,   setLocations]   = useState([])
  const [locFilter,   setLocFilter]   = useState('')
  // Display-only filter over rows already loaded. U-03: with 559 bar items
  // and one row per (item, location), a name search is what makes this table
  // readable. It changes nothing about what is fetched.
  const [query,       setQuery]       = useState('')
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

  const q = query.trim().toLowerCase()
  const visible = rows.filter(r =>
    (!locFilter || r.locationKey === locFilter) &&
    (!q || r.name.toLowerCase().includes(q) || (r.sku ?? '').toLowerCase().includes(q)))

  return (
    <div className="p-6 space-y-5">
      <Toast toast={toast} />

      <SectionHead
        title="Current stock"
        subtitle="One row per item per location. The Main Store and each department hold their balances separately."
        action={
          <p className="text-xs text-ink-soft tnum">
            {visible.length} of {rows.length} rows
          </p>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Search" className="w-full sm:w-72">
          <SearchInput
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Item name or SKU…"
            aria-label="Search stock by item name or SKU"
          />
        </Field>
        <Field label="Location" className="w-full sm:w-56">
          <Sel value={locFilter} onChange={e => setLocFilter(e.target.value)}>
            <option value="">All locations</option>
            {locations.map(name => <option key={name} value={name}>{name}</option>)}
          </Sel>
        </Field>
      </div>

      <TableWrap>
        <table className="w-full">
          <Thead>
            <tr>
              <Th>Item</Th><Th>SKU</Th><Th>Location</Th><Th>Unit</Th>
              <Th>In stock</Th><Th>Reorder at</Th><Th>Par</Th><Th>Status</Th>
            </tr>
          </Thead>
          <tbody>
            {visible.map(item => (
              <tr key={item.id} className="border-t border-line hover:bg-gray-50 wl-transition">
                <TdBold>{item.name}</TdBold>
                <Td><span className="text-ink-soft">{item.sku}</span></Td>
                <Td>{item.location}</Td>
                <Td>{item.unit}</Td>
                <TdBold>{item.quantity}</TdBold>
                <Td>{item.reorder_level}</Td>
                <td className="px-4 py-3 text-sm">
                  {item.par_level == null
                    ? <span className="text-gray-300" title="Not on the end-of-day par cycle">—</span>
                    : <span className={Number(item.quantity) < Number(item.par_level) ? 'font-semibold text-amber-700' : 'text-gray-600'}>
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
                  ? 'No stock items yet. Add them in Admin \u2192 Stock Items.'
                  : 'Nothing matches this search and location. Clear the filters to see everything.'
              } />
            )}
          </tbody>
        </table>
      </TableWrap>
    </div>
  )
}
