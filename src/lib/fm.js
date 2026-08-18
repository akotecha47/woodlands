// src/lib/fm.js
// Farmers Market data access for the 061 surfaces: the 3-level product
// taxonomy, the attendance view, the waiting list, forfeiture and the fee
// schedule.
//
// Two rules this module exists to hold in one place:
//
//   1. THE FEE SCHEDULE IS THE DATABASE, NOT A CONSTANT. fm_fee_schedule is
//      authoritative. FM_FEES in src/lib/constants.js is a fallback for first
//      paint only — it was wrong for months (id_card 5000, reprint 10000
//      against Dhiren's confirmed 30000/20000) precisely because nothing
//      reconciled it against anything.
//
//   2. A PRODUCT CHANGE GOES THROUGH THE RPC, NEVER THROUGH DIRECT WRITES.
//      change_holder_products raises the MWK 10,000 fee in the same
//      transaction as the change. Writing fm_approved_items directly from the
//      client would silently skip the charge, which is the exact failure
//      FUNCTIONAL_SPEC §7 calls out.

import { supabase } from './supabase'

// ── taxonomy ───────────────────────────────────────────────────────────────

// Returns { categories, types, items, byCategory, typesById, itemsById }.
// One round trip per level; the lists are small (6 / 17 / 51) and fully cached
// by the caller for the lifetime of the tab.
export async function fetchTaxonomy() {
  const [cR, tR, iR] = await Promise.all([
    supabase.from('fm_categories').select('*').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('fm_product_types').select('*').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('fm_items').select('*').eq('is_active', true).order('sort_order').order('name'),
  ])
  const categories = cR.data ?? []
  const types      = tR.data ?? []
  const items      = iR.data ?? []

  const typesById = Object.fromEntries(types.map(t => [t.id, t]))
  const itemsById = Object.fromEntries(items.map(i => [i.id, i]))
  const byCategory = categories.map(c => ({
    ...c,
    types: types
      .filter(t => t.category_id === c.id)
      .map(t => ({ ...t, items: items.filter(i => i.product_type_id === t.id) })),
  }))

  return { categories, types, items, byCategory, typesById, itemsById }
}

// "Crafts › Paintings › Oil painting" for one item id.
export function itemPath(taxonomy, itemId) {
  const item = taxonomy?.itemsById?.[itemId]
  if (!item) return '—'
  const type = taxonomy.typesById?.[item.product_type_id]
  const cat  = taxonomy.categories?.find(c => c.id === type?.category_id)
  return [cat?.name, type?.name, item.name].filter(Boolean).join(' › ')
}

// ── attendance ─────────────────────────────────────────────────────────────

// v_fm_attendance is one row per holder per market day. Collapse it to one
// entry per holder with the days in newest-first order, which is how every
// screen wants it.
export async function fetchAttendance() {
  const { data, error } = await supabase
    .from('v_fm_attendance')
    .select('*')
    .order('stall_number')
    .order('market_date', { ascending: false })
  if (error) throw error

  const byHolder = {}
  const marketDates = []
  for (const r of data ?? []) {
    if (!marketDates.includes(r.market_date)) marketDates.push(r.market_date)
    if (!byHolder[r.holder_id]) {
      byHolder[r.holder_id] = {
        holder_id:        r.holder_id,
        stall_number:     r.stall_number,
        full_name:        r.full_name,
        business_name:    r.business_name,
        status:           r.status,
        category_id:      r.category_id,
        attended_count:   r.attended_count,
        missed_count:     r.missed_count,
        last_visit_date:  r.last_visit_date,
        forfeit_eligible: r.forfeit_eligible,
        days:             [],
      }
    }
    byHolder[r.holder_id].days.push({
      market_date: r.market_date,
      attended:    r.attended,
      fee_paid:    r.fee_paid,
    })
  }
  marketDates.sort().reverse()
  return { byHolder, marketDates, rows: data ?? [] }
}

// ── fee schedule ───────────────────────────────────────────────────────────

export async function fetchFeeSchedule() {
  const { data, error } = await supabase
    .from('fm_fee_schedule')
    .select('*')
    .order('fee_code')
  if (error) throw error
  const byCode = Object.fromEntries((data ?? []).map(f => [f.fee_code, f]))
  return { fees: data ?? [], byCode }
}

// Amount for a fee code, falling back to the constant only if the row is
// missing. Never invents a number.
export function feeAmount(byCode, code, fallback = null) {
  const row = byCode?.[code]
  if (row && row.is_active) return Number(row.amount)
  return fallback
}

// ── waiting list ───────────────────────────────────────────────────────────

// Queue position is DERIVED, never stored — the same ordering the
// forfeit_stall() RPC uses server-side, so what the screen shows as "next" is
// what actually gets offered.
export async function fetchWaitingList() {
  const { data, error } = await supabase
    .from('fm_waiting_list')
    .select('*')
    .order('applied_at')
    .order('created_at')
    .order('id')
  if (error) throw error
  let pos = 0
  return (data ?? []).map(w => ({
    ...w,
    position: w.status === 'waiting' ? ++pos : null,
  }))
}

// ── the two RPCs ───────────────────────────────────────────────────────────

// Replaces the holder's approved items AND raises the product-change fee, in
// one transaction, server-side. Returns the RPC's jsonb result, which reports
// whether a fee was actually raised — an unchanged set is a no-op and charges
// nothing.
export async function changeHolderProducts({
  holderId, itemIds, categoryId = null, paymentMethod = 'cash', reference = null, notes = null,
}) {
  const { data, error } = await supabase.rpc('change_holder_products', {
    p_holder_id:      holderId,
    p_item_ids:       itemIds,
    p_category_id:    categoryId,
    p_payment_method: paymentMethod,
    p_reference:      reference,
    p_notes:          notes,
  })
  if (error) throw error
  return data
}

// Forfeit a stall and offer it to the head of the waiting list. Eligibility is
// re-checked server-side against v_fm_attendance, so this cannot be driven from
// a stale screen.
export async function forfeitStall({ holderId, waitingId = null, reason = null }) {
  const { data, error } = await supabase.rpc('forfeit_stall', {
    p_holder_id:  holderId,
    p_waiting_id: waitingId,
    p_reason:     reason,
  })
  if (error) throw error
  return data
}

export async function fetchForfeitures() {
  const { data, error } = await supabase
    .from('fm_stall_forfeitures')
    .select('*')
    .order('decided_at', { ascending: false })
  if (error) throw error
  return data ?? []
}
