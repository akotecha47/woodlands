import { supabase } from '../../lib/supabase'
import { MANAGE_ROLES } from '../../lib/roles'
import { Badge } from '../ui/kit'

// ── label helpers ──────────────────────────────────────────────
export const todayStr = () => new Date().toISOString().slice(0, 10)
export const itemLabel = item => `${item.name} — ${item.sku}`

// ── table helpers ──────────────────────────────────────────────
// EmptyRow / TdBold / AccessDenied now come from the one kit
// (src/components/ui/kit.jsx). Re-exported here so the eight Inventory tabs
// that import them from this file keep working unchanged.
export { EmptyRow, TdBold, AccessDenied } from '../ui/kit'

// ── status badges ──────────────────────────────────────────────
// Both badges below are the kit Badge with the module's own vocabulary mapped
// onto the three status tones. No new colours: low = alert, ok = ok,
// pending = warn, approved = brand (in progress, not a health judgement).

export function StockBadge({ quantity, reorderLevel }) {
  const low = Number(quantity) <= Number(reorderLevel)
  return <Badge tone={low ? 'alert' : 'ok'}>{low ? 'Low' : 'OK'}</Badge>
}

const REQ_TONES = {
  pending:   'warn',
  approved:  'brand',
  fulfilled: 'ok',
  rejected:  'alert',
}

export function ReqStatusBadge({ status }) {
  return (
    <Badge tone={REQ_TONES[status] ?? 'neutral'} className="capitalize">
      {status}
    </Badge>
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

// Populates the "Received by" pickers on Log Delivery and Transfers. Dropped
// 'store_supervisor' from the filter: the role was removed from roles.js in
// June (commits 5d86e3e, 00fbdaa) and no user_profiles row can hold it, so it
// only ever widened the query to nothing. Matches the owner/manager gate on
// both tabs that use this.
export async function fetchStaffUsers() {
  const { data } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .in('role', MANAGE_ROLES)
    .eq('is_active', true)
    .order('full_name')
  return data ?? []
}

// shiftStock was removed in Sprint C / Task 4. It did a read-then-write on
// current_stock with no lock and no transaction, and left the caller to insert
// the stock_movements row as a second statement.
//
// Use applyStockDelta / setStockQuantity from src/lib/stock.js instead. They
// call the Postgres functions from migration 025, which lock the row and write
// the balance and the ledger entry atomically — and they write the movement
// row themselves, so callers must not.
