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
//      change_holder_products raises the product-change fee PER ITEM CHANGED,
//      in the same transaction as the change. Since 063 this is enforced by
//      the database rather than by convention: `authenticated` holds SELECT
//      and nothing else on fm_holder_products, so a client-side insert cannot
//      skip the charge even if someone writes one.

import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { FM_FEES } from './constants'

// ── approved products (063) ────────────────────────────────

// Every business's approved list, as { holderId: [{ id, item_name, added_at }] }.
// One round trip for all of them: 663 rows across 289 holders is smaller than
// the holder list itself, and the Businesses screen needs every holder's items
// to render the table without an N+1.
//
// Replaces fetchTaxonomy(). The fm_categories / fm_product_types / fm_items
// tables and fm_approved_items were RETIRED in 063 — 311 of 311 holders could
// not be classified into the 51-item catalogue, and the real answer was already
// in fm_holders.products, the February register text, on 289 of them.
export async function fetchHolderProducts() {
  const { data, error } = await supabase
    .from('fm_holder_products')
    .select('id, holder_id, item_name, added_at')
    .order('item_name')
  if (error) throw error

  const byHolder = {}
  for (const r of data ?? []) {
    (byHolder[r.holder_id] ??= []).push(r)
  }
  return { byHolder, rows: data ?? [] }
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

/**
 * THE FEE SEAM — C-08, wired in Block 3 / C.
 *
 * fm_fee_schedule has been authoritative in name only. Six charging surfaces
 * read their amounts from the FM_FEES constant instead, and FeesTab told the
 * owner on screen that "changing an amount here takes effect immediately — no
 * deploy needed". All the copies agreed, so nothing looked wrong until the
 * owner edited a fee — at which point the claim was falsifiable in two clicks.
 *
 * Every charging surface now takes its amount from here. `FM_FEES` survives as
 * what its own comment always said it was: a FIRST-PAINT FALLBACK, used for the
 * few hundred milliseconds before the table resolves and if the row is missing
 * or deactivated. It is never the source of a charge that lands in the
 * database once the schedule has loaded.
 *
 * `loaded` is exposed so a surface that must not quote a stale figure — the
 * confirm dialog on a charge, say — can wait rather than flash the fallback.
 */
export function useFeeSchedule() {
  const [byCode, setByCode] = useState(null)

  useEffect(() => {
    let alive = true
    fetchFeeSchedule()
      .then(r => { if (alive) setByCode(r.byCode) })
      // A failed read must not take the screen down, and must not silently
      // become "free" either: the fallback is the last known-good schedule.
      .catch(() => { if (alive) setByCode({}) })
    return () => { alive = false }
  }, [])

  return {
    byCode,
    loaded: byCode !== null,
    fee: code => feeAmount(byCode, code, FM_FEES[code] ?? null),
  }
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

// Replaces a business's approved product list and raises the product-change fee
// PER ITEM CHANGED, in one transaction, server-side.
//
// `itemNames` is free text now, not catalogue ids (063). The RPC returns what
// it actually did — how many items were added, removed and CHARGED, and whether
// this was the free initial list — so the screen reports the charge from the
// server's own arithmetic rather than recomputing it and risking a different
// answer from the one that hit fm_payments.
export async function changeHolderProducts({
  holderId, itemNames, paymentMethod = 'cash', reference = null, notes = null,
}) {
  const { data, error } = await supabase.rpc('change_holder_products', {
    p_holder_id:      holderId,
    p_item_names:     itemNames,
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
