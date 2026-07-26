import { supabase } from '../../lib/supabase'

// ── label helpers ──────────────────────────────────────────────
export const todayStr = () => new Date().toISOString().slice(0, 10)
export const itemLabel = item => `${item.name} — ${item.sku}`

// ── table helpers ──────────────────────────────────────────────
export function EmptyRow({ cols, msg = 'No records found' }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-8 text-center text-sm text-gray-400">{msg}</td>
    </tr>
  )
}

export function TdBold({ children }) {
  return <td className="px-4 py-3 text-sm font-medium text-gray-900">{children ?? '—'}</td>
}

// ── status badges ──────────────────────────────────────────────
export function StockBadge({ quantity, reorderLevel }) {
  const low = Number(quantity) <= Number(reorderLevel)
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
      low ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
    }`}>
      {low ? 'Low' : 'OK'}
    </span>
  )
}

export function ReqStatusBadge({ status }) {
  const colours = {
    pending:   'bg-yellow-100 text-yellow-700',
    approved:  'bg-blue-100  text-blue-700',
    fulfilled: 'bg-green-100 text-green-700',
    rejected:  'bg-red-100   text-red-700',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${colours[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

// ── access gate ────────────────────────────────────────────────
export function AccessDenied() {
  return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        Access denied. You don't have permission to use this feature.
      </div>
    </div>
  )
}

// ── shared DB helpers ──────────────────────────────────────────

export async function fetchActiveItems() {
  const { data } = await supabase
    .from('stock_items')
    .select('id, name, sku, unit, department')
    .eq('is_active', true)
    .order('name')
  return data ?? []
}

export async function fetchDepartmentList() {
  const { data } = await supabase.from('departments').select('id, name').order('name')
  return data ?? []
}

export async function fetchUserMap() {
  const { data } = await supabase.from('user_profiles').select('id, full_name')
  return data ? Object.fromEntries(data.map(u => [u.id, u.full_name])) : {}
}

export async function fetchStaffUsers() {
  const { data } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .in('role', ['owner', 'manager', 'store_supervisor'])
    .eq('is_active', true)
    .order('full_name')
  return data ?? []
}

// Add `delta` to a stock item's current_stock row (upserts if row missing).
// Throws on DB error, and throws when a negative delta exceeds what is in
// stock, so callers can catch and flash.
//
// This previously clamped with Math.max(0, current + delta), which silently
// under-deducted an over-requisition instead of failing: fulfilling a
// requisition for 20 against 5 in stock recorded a stock_movements row for
// -20 while removing only 5, so the ledger and the balance disagreed
// permanently and invisibly. Fail closed instead.
export async function shiftStock(stockItemId, delta) {
  const { data, error: readErr } = await supabase
    .from('current_stock')
    .select('quantity')
    .eq('stock_item_id', stockItemId)
    .maybeSingle()
  if (readErr) throw readErr

  const current = Number(data?.quantity) || 0
  const newQty  = current + Number(delta)

  if (newQty < 0) {
    throw new Error(
      `Insufficient stock — ${current} available, ${Math.abs(Number(delta))} required. Stock unchanged.`
    )
  }

  const { error } = await supabase.from('current_stock').upsert(
    { stock_item_id: stockItemId, quantity: newQty, last_updated: new Date().toISOString() },
    { onConflict: 'stock_item_id' }
  )
  if (error) throw error
}
