import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { MAIN_STORE } from '../../lib/constants'
import { collapsePairs, parseSupplier, routeFor } from '../../lib/ledger'
import { Th, Td, Toast, Sel, fmtDate } from '../admin/AdminUI'
import { EmptyRow, TdBold, fetchActiveItems, fetchDepartmentList, fetchUserMap } from './InventoryUI'
import { Badge } from '../ui/kit'
import { useFlash } from '../ui/useFlash'

/**
 * The consolidated Movement Ledger — every stock movement in one place.
 *
 * Replaces DeliveryLogTab, which filtered `movement_type = 'delivery'` and so
 * showed one of the eight types. Requisition fulfils, transfers, issues, stock
 * takes and event allocations all wrote ledger rows that this screen never
 * displayed. The delivery-only view is preserved as a preset (see
 * DELIVERY_PRESET below), so nothing that used the old tab has lost anything.
 *
 * Access is decided by RLS, not here. owner/admin see the whole ledger; a
 * department_head sees only rows whose from_department or to_department is
 * their department (stock_movements_dept_select). A head's ledger being EMPTY
 * on placeholder data is correct, not a bug: opening_balance rows carry no
 * from/to, and neither do event rows today.
 */

// Every value permitted by stock_movements_movement_type_check_v5 (migration
// 060). Kept in step with that CHECK and with MOVEMENT_TYPES in src/lib/stock.js.
// A type missing from this list still renders — TypeBadge falls back to the raw
// value — but it cannot be FILTERED, which is the silent half of the drift.
// A movement TYPE is a label, not a verdict. The old list gave each one its own
// hue (indigo, purple, rose, slate...), which put nine decorative colours on one
// screen and made "Event Allocation" look more alarming than "Delivery". Under
// the Block 2 colour rule, a colour that is not carrying meaning is grey \u2014 and
// the meaning here is already carried, correctly, by the signed quantity.
const TYPES = [
  { value: 'delivery',         label: 'Delivery'         },
  { value: 'issue',            label: 'Issue'            },
  { value: 'transfer',         label: 'Transfer'         },
  { value: 'requisition',      label: 'Requisition'      },
  { value: 'adjustment',       label: 'Adjustment'       },
  { value: 'opening_balance',  label: 'Opening Balance'  },
  { value: 'event_allocation', label: 'Event Allocation' },
  { value: 'event_return',     label: 'Event Return'     },
  { value: 'consumption',      label: 'Consumption'      },
]
const TYPE_META = Object.fromEntries(TYPES.map(t => [t.value, t]))

// The old tab's job, kept as a one-click preset rather than a separate screen.
const DELIVERY_PRESET = 'delivery'

// A defensive ceiling. 533 opening_balance rows already exist, and PostgREST
// would otherwise apply its own default limit silently.
const ROW_LIMIT = 1000

function TypeBadge({ type }) {
  const meta = TYPE_META[type]
  return <Badge tone="neutral">{meta?.label ?? type}</Badge>
}

/** Signed and coloured for single rows; a neutral magnitude for a collapsed move. */
function Qty({ entry, unit }) {
  const qty = Number(entry.row.quantity_change)
  if (entry.kind === 'pair') {
    return <span className="font-mono text-sm text-gray-700">{qty} {unit}</span>
  }
  const positive = qty > 0
  return (
    <span className={`font-mono text-sm font-medium ${positive ? 'text-green-700' : 'text-red-600'}`}>
      {positive ? '+' : '−'}{Math.abs(qty)} {unit}
    </span>
  )
}

/** "From → To", for the movements that actually have one. See routeFor. */
function Route({ entry }) {
  const r     = entry.row
  const route = routeFor(r)

  // The supplier is NOT a route — putting parseSupplier(notes) in the From slot
  // was the render bug 058 introduced ("Aman → —"). It now has its own column,
  // restoring what the old Delivery Log showed, so this cell just says "no
  // route" honestly.
  if (!route) return <span className="text-gray-400">—</span>
  const { from, to } = route
  return (
    <span className="text-sm text-gray-600 whitespace-nowrap">
      <span className={from ? '' : 'text-gray-400'}>{from ?? '—'}</span>
      <span className="mx-1.5 text-gray-400">→</span>
      <span className={to ? '' : 'text-gray-400'}>{to ?? '—'}</span>
    </span>
  )
}

export default function MovementLedgerTab() {
  const [entries,     setEntries]     = useState([])
  const [items,       setItems]       = useState([])
  const [departments, setDepartments] = useState([])
  const [userNames,   setUserNames]   = useState({})
  const [truncated,   setTruncated]   = useState(false)

  const [itemFilter, setItemFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [toast,      setToast]      = useState(null)
  const flash = useFlash(setToast)

  async function fetchMovements() {
    let q = supabase
      .from('stock_movements')
      .select(`
        id, movement_type, quantity_change, from_department, to_department,
        notes, created_at, performed_by, stock_item_id,
        stock_items(name, sku, unit)
      `)
      .order('created_at', { ascending: false })
      .limit(ROW_LIMIT)

    if (itemFilter) q = q.eq('stock_item_id', itemFilter)
    if (typeFilter) q = q.eq('movement_type', typeFilter)
    // A movement belongs to a department at either end of it.
    // The value is double-quoted: inside an or() group PostgREST treats a comma
    // as the separator between conditions, so any location name containing one
    // would silently split into two broken filters. Every real name here is
    // space-separated ('Main Store', 'Sports Bar') and would survive unquoted,
    // but the quoting is what makes that true by construction rather than by
    // luck about how departments happen to be named today.
    if (deptFilter) {
      q = q.or(`from_department.eq."${deptFilter}",to_department.eq."${deptFilter}"`)
    }
    if (dateFrom)   q = q.gte('created_at', dateFrom)
    if (dateTo)     q = q.lte('created_at', dateTo + 'T23:59:59Z')

    const { data, error } = await q
    if (error) { flash(error.message, false); return }
    const rows = data ?? []
    setTruncated(rows.length >= ROW_LIMIT)
    setEntries(collapsePairs(rows))
  }

  useEffect(() => {
    fetchActiveItems().then(setItems)
    fetchUserMap().then(setUserNames)
    fetchDepartmentList().then(setDepartments)
  }, [])

  useEffect(() => { fetchMovements() }, [itemFilter, typeFilter, deptFilter, dateFrom, dateTo])

  const hasFilter    = itemFilter || typeFilter || deptFilter || dateFrom || dateTo
  const clearFilters = () => {
    setItemFilter(''); setTypeFilter(''); setDeptFilter(''); setDateFrom(''); setDateTo('')
  }
  const locations = [MAIN_STORE, ...departments.map(d => d.name)]

  // The date inputs' own class. This used to be called `selectCls` and also
  // dressed the three filter selects — a local name shadowing the kit's export
  // with a DIFFERENT value (the kit's carries `appearance-none`, which needs
  // <Sel>'s chevron to stay usable). The selects are <Sel> now; this is only
  // ever an <input>, so it is named for what it is.
  const dateCls = 'bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm wl-transition hover:border-gray-400 focus:border-teal focus:ring-2 focus:ring-teal/25'

  return (
    <div className="p-6 space-y-4">
      <Toast toast={toast} />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="text-[15px] font-bold text-navy mr-1">Movement Ledger</h2>

        <Sel value={itemFilter} onChange={e => setItemFilter(e.target.value)}
          aria-label="Filter by item" wrapClassName="w-56">
          <option value="">All Items</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name} — {i.sku}</option>)}
        </Sel>

        <Sel value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          aria-label="Filter by movement type" wrapClassName="w-44">
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Sel>

        <Sel value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          aria-label="Filter by department" wrapClassName="w-48">
          <option value="">All Departments</option>
          {locations.map(name => <option key={name} value={name}>{name}</option>)}
        </Sel>

        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          aria-label="From date" className={dateCls} />
        <span className="text-sm text-gray-400">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          aria-label="To date" className={dateCls} />

        {/* Replaces the old delivery-only tab. */}
        <button
          onClick={() => setTypeFilter(DELIVERY_PRESET)}
          className={`text-xs px-2.5 py-1.5 rounded-lg border wl-transition ${
            typeFilter === DELIVERY_PRESET
              ? 'bg-green-50 border-green-300 text-green-700'
              : 'border-gray-300 text-gray-500 hover:text-gray-700'
          }`}>
          Deliveries only
        </button>

        {hasFilter && (
          <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-700 underline">
            Clear filters
          </button>
        )}
      </div>

      {truncated && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Showing the most recent {ROW_LIMIT} movements. Narrow the filters to see older entries.
        </p>
      )}

      {/* Table */}
      <div className="wl-scroll-x border border-line rounded-xl bg-white">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-line">
              <Th>Date</Th><Th>Item</Th><Th>SKU</Th><Th>Type</Th>
              <Th>From → To</Th><Th>Supplier</Th><Th>Qty</Th><Th>Performed By</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => {
              const m = entry.row
              return (
                <tr key={entry.key} className="border-b border-line last:border-0 hover:bg-gray-50">
                  <Td>{fmtDate(m.created_at)}</Td>
                  <TdBold>{m.stock_items?.name}</TdBold>
                  <Td>{m.stock_items?.sku}</Td>
                  <td className="px-4 py-3"><TypeBadge type={m.movement_type} /></td>
                  <td className="px-4 py-3"><Route entry={entry} /></td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {parseSupplier(m.notes) ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3" title={m.notes ?? ''}>
                    <Qty entry={entry} unit={m.stock_items?.unit ?? ''} />
                  </td>
                  <Td>{userNames[m.performed_by]}</Td>
                </tr>
              )
            })}
            {entries.length === 0 && <EmptyRow cols={8} msg="No movements found" />}
          </tbody>
        </table>
      </div>
    </div>
  )
}
