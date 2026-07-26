// public-checkin — unauthenticated farmers-market stall-holder check-in.
//
// Sprint B / Task 2. Replaces the service_role client that CheckIn.jsx used
// to hold in the browser (WOODLANDS_AUDIT_2.md §3 "PUBLIC — no authentication
// required", and prior-audit finding 2.3).
//
// WHY A FUNCTION AND NOT AN ANON RLS POLICY
// -----------------------------------------
// /checkin is reachable with no session, so the anon-client route would need
// `GRANT SELECT ON fm_holders TO anon` plus a `USING (true)` policy. That
// makes every stall holder's PII readable by anyone, permanently, by policy —
// trading a leaked key for a standing public read on personal data. There is
// no per-row predicate available to narrow it: the visitor has no identity.
//
// This function keeps service_role server-side and is deliberately narrow:
//   * it returns FOUR holder columns, never select('*')
//   * it never lists or searches holders — a holder is reachable only by
//     presenting its exact UUID
//   * it computes the market day itself, so a caller cannot fabricate visits
//     on arbitrary dates
//   * inactive holders are indistinguishable from non-existent ones
//
// It must be deployed with --no-verify-jwt (there is no caller to verify).
// That is the whole reason the surface above is kept this narrow.
//
// NOT SOLVED HERE: holder UUIDs remain guessable-by-possession and there is no
// rate limit, so this does not fully close prior-audit finding 2.3. Logged in
// WOODLANDS_FOLLOWUPS.md.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = 'https://woodlands-beta.vercel.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
}

// Only the columns the check-in card renders. Nothing else leaves the server.
const HOLDER_FIELDS = 'id, full_name, business_name, stall_number, status'
const VISIT_FIELDS  = 'id, checked_in_at, checked_out_at'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Market-day maths — ported from src/components/farmers-market/FarmersMarketUI
// (getLastSaturdayOfMonth / getMarketDayForMonth), same rule: the last Saturday
// of the month, and no market in December.
//
// Computed in Africa/Blantyre (UTC+2), NOT the Deno host's UTC. The browser
// previously did this in Malawi local time; using UTC here would shift the
// date for two hours every night and change behaviour. This preserves the
// existing rule rather than altering it.
// ---------------------------------------------------------------------------

const MW_OFFSET_MS = 2 * 60 * 60 * 1000

function malawiNow(): Date {
  return new Date(Date.now() + MW_OFFSET_MS)
}

function toDateStr(d: Date): string {
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function getMarketDayForMonth(year: number, month: number): string | null {
  if (month === 11) return null // December — no market
  const lastDay = new Date(Date.UTC(year, month + 1, 0))
  const offset  = (lastDay.getUTCDay() - 6 + 7) % 7
  lastDay.setUTCDate(lastDay.getUTCDate() - offset)
  return toDateStr(lastDay)
}

function daysApart(a: string, b: string): number {
  return Math.abs(Math.round(
    (new Date(a + 'T12:00:00Z').getTime() - new Date(b + 'T12:00:00Z').getTime()) / 86400000
  ))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const action    = typeof body.action === 'string' ? body.action : ''
  const holderId  = typeof body.holder_id === 'string' ? body.holder_id : ''

  if (!['lookup', 'check_in', 'check_out'].includes(action)) {
    return jsonResponse({ error: 'Unknown action' }, 400)
  }
  // Reject anything that is not UUID-shaped before it reaches the database.
  if (!UUID_RE.test(holderId)) {
    return jsonResponse({ not_found: true }, 200)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    // ---- holder --------------------------------------------------------
    const { data: holder, error: holderErr } = await admin
      .from('fm_holders')
      .select(HOLDER_FIELDS)
      .eq('id', holderId)
      .maybeSingle()

    // Inactive holders return the same shape as missing ones, so the response
    // does not confirm that a given UUID exists.
    if (holderErr || !holder || holder.status === 'inactive') {
      return jsonResponse({ not_found: true }, 200)
    }

    // ---- market day (server-authoritative) ------------------------------
    const now       = malawiNow()
    const marketDay = getMarketDayForMonth(now.getUTCFullYear(), now.getUTCMonth())

    if (!marketDay) {
      return jsonResponse({ holder, market_day: null, visit: null, no_market: true }, 200)
    }
    if (daysApart(marketDay, toDateStr(now)) > 1) {
      return jsonResponse({ holder, market_day: marketDay, visit: null, no_market: true }, 200)
    }

    // ---- current visit ---------------------------------------------------
    const { data: existing } = await admin
      .from('fm_visits')
      .select(VISIT_FIELDS)
      .eq('holder_id', holderId)
      .eq('visit_date', marketDay)
      .maybeSingle()

    if (action === 'lookup') {
      return jsonResponse({ holder, market_day: marketDay, visit: existing ?? null }, 200)
    }

    const nowIso = new Date().toISOString()

    if (action === 'check_in') {
      let visit
      if (!existing) {
        const { data, error } = await admin
          .from('fm_visits')
          .insert({
            holder_id:     holderId,
            visit_date:    marketDay,
            checked_in_at: nowIso,
            checked_in_by: null,
            fee_paid:      false,
          })
          .select(VISIT_FIELDS)
          .single()
        if (error) throw error
        visit = data
      } else {
        const { data, error } = await admin
          .from('fm_visits')
          .update({ checked_in_at: nowIso })
          .eq('id', existing.id)
          .select(VISIT_FIELDS)
          .single()
        if (error) throw error
        visit = data
      }
      return jsonResponse({ holder, market_day: marketDay, visit }, 200)
    }

    // action === 'check_out'
    if (!existing) {
      return jsonResponse({ error: 'Not checked in' }, 400)
    }
    const { data: visit, error } = await admin
      .from('fm_visits')
      .update({ checked_out_at: nowIso })
      .eq('id', existing.id)
      .select(VISIT_FIELDS)
      .single()
    if (error) throw error

    return jsonResponse({ holder, market_day: marketDay, visit }, 200)
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 400)
  }
})
