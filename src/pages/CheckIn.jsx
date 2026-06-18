import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import { fmtDate, getMarketDayForMonth } from '../components/farmers-market/FarmersMarketUI'

const SETUP_HOUR  = 7   // 07:30 — set-up deadline
const SETUP_MIN   = 30
const PACKUP_HOUR = 12  // 12:30 — pack-up deadline
const PACKUP_MIN  = 30

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function isAfter(ts, hour, min) {
  if (!ts) return false
  const d = new Date(ts)
  return d.getHours() > hour || (d.getHours() === hour && d.getMinutes() >= min)
}

function daysApart(a, b) {
  return Math.abs(Math.round(
    (new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) / 86400000
  ))
}

export default function CheckIn() {
  const [params]    = useSearchParams()
  const holderId    = params.get('holder')

  const [holder,    setHolder]    = useState(null)
  const [visit,     setVisit]     = useState(null)   // fm_visits row or null
  const [marketDay, setMarketDay] = useState(null)
  // phase: loading | not_found | no_market | check_in | checked_in | checked_out | error
  const [phase,     setPhase]     = useState('loading')
  const [busy,      setBusy]      = useState(false)

  useEffect(() => {
    if (!holderId) { setPhase('not_found'); return }
    init()
  }, [holderId])

  async function init() {
    try {
      const { data: h, error } = await supabaseAdmin
        .from('fm_holders')
        .select('id, full_name, business_name, stall_number, status')
        .eq('id', holderId)
        .single()

      if (error || !h || h.status === 'inactive') { setPhase('not_found'); return }
      setHolder(h)

      const now = new Date()
      const md  = getMarketDayForMonth(now.getFullYear(), now.getMonth())

      if (!md) { setPhase('no_market'); return }  // December — no market this month

      if (daysApart(md, todayStr()) > 1) { setMarketDay(md); setPhase('no_market'); return }
      setMarketDay(md)

      const { data: v } = await supabaseAdmin
        .from('fm_visits')
        .select('id, checked_in_at, checked_out_at')
        .eq('holder_id', holderId)
        .eq('visit_date', md)
        .maybeSingle()

      setVisit(v)
      resolvePhase(v)
    } catch {
      setPhase('error')
    }
  }

  function resolvePhase(v) {
    if (!v || !v.checked_in_at)  { setPhase('check_in');    return }
    if (!v.checked_out_at)        { setPhase('checked_in');  return }
    setPhase('checked_out')
  }

  async function handleCheckIn() {
    if (busy) return
    setBusy(true)
    try {
      const now = new Date().toISOString()
      let row
      if (!visit) {
        const { data, error } = await supabaseAdmin
          .from('fm_visits')
          .insert({
            holder_id:     holderId,
            visit_date:    marketDay,
            checked_in_at: now,
            checked_in_by: null,
            fee_paid:      false,
          })
          .select('id, checked_in_at, checked_out_at')
          .single()
        if (error) throw error
        row = data
      } else {
        const { data, error } = await supabaseAdmin
          .from('fm_visits')
          .update({ checked_in_at: now })
          .eq('id', visit.id)
          .select('id, checked_in_at, checked_out_at')
          .single()
        if (error) throw error
        row = data
      }
      setVisit(row)
      setPhase('checked_in')
    } catch {
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }

  async function handleCheckOut() {
    if (!visit || busy) return
    setBusy(true)
    try {
      const { data, error } = await supabaseAdmin
        .from('fm_visits')
        .update({ checked_out_at: new Date().toISOString() })
        .eq('id', visit.id)
        .select('id, checked_in_at, checked_out_at')
        .single()
      if (error) throw error
      setVisit(data)
      setPhase('checked_out')
    } catch {
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }

  // ── early-exit screens ──────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  if (phase === 'not_found') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
          <p className="text-4xl mb-3">🔍</p>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Business not found</h1>
          <p className="text-sm text-gray-500">This QR code is invalid or the business account is inactive.</p>
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-500">Please try again or contact the market manager.</p>
        </div>
      </div>
    )
  }

  // ── main card ───────────────────────────────────────────────────────────────

  const displayName = holder?.business_name || holder?.full_name
  const avatarChar  = displayName?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">

        {/* Business identity */}
        <div className="mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl font-bold text-green-700">{avatarChar}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
          {holder?.business_name && holder?.full_name !== holder?.business_name && (
            <p className="text-sm text-gray-500 mt-0.5">{holder.full_name}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">Stall {holder?.stall_number}</p>
        </div>

        <div className="border-t border-gray-100 pt-6 space-y-4">

          {/* No market today */}
          {phase === 'no_market' && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700">No market today</p>
              {marketDay && (
                <p className="text-xs text-gray-400 mt-1">Next market day: {fmtDate(marketDay)}</p>
              )}
            </div>
          )}

          {/* State A — not yet checked in */}
          {phase === 'check_in' && (
            <>
              <button
                onClick={handleCheckIn}
                disabled={busy}
                className="w-full bg-brand-teal hover:bg-brand-teal-dark text-white font-semibold py-4 rounded-xl text-lg transition-colors disabled:opacity-60"
              >
                {busy ? 'Checking in…' : 'Check In'}
              </button>
              <p className="text-xs text-gray-400">Market hours: set up by 07:30, pack up by 12:30.</p>
            </>
          )}

          {/* State B — checked in, not yet out */}
          {phase === 'checked_in' && (
            <>
              <div>
                <p className="text-sm font-medium text-green-700">
                  Checked in at {fmtTime(visit?.checked_in_at)}
                </p>
                {isAfter(visit?.checked_in_at, SETUP_HOUR, SETUP_MIN) && (
                  <p className="text-xs text-amber-600 mt-1">Checked in after setup time.</p>
                )}
              </div>
              <button
                onClick={handleCheckOut}
                disabled={busy}
                className="w-full bg-gray-800 hover:bg-gray-900 text-white font-semibold py-4 rounded-xl text-lg transition-colors disabled:opacity-60"
              >
                {busy ? 'Checking out…' : 'Check Out'}
              </button>
              <p className="text-xs text-gray-400">Market hours: set up by 07:30, pack up by 12:30.</p>
            </>
          )}

          {/* State C — fully complete */}
          {phase === 'checked_out' && (
            <>
              <div className="bg-green-50 rounded-xl p-4 text-left space-y-1">
                <p className="text-sm text-green-700">
                  Checked in at <span className="font-semibold">{fmtTime(visit?.checked_in_at)}</span>
                </p>
                <p className="text-sm text-green-800">
                  Checked out at <span className="font-semibold">{fmtTime(visit?.checked_out_at)}</span>
                </p>
                {isAfter(visit?.checked_out_at, PACKUP_HOUR, PACKUP_MIN) && (
                  <p className="text-xs text-amber-600 pt-1">Checked out after pack-up time.</p>
                )}
              </div>
              <p className="text-sm text-gray-500">
                You have checked in and out today. See you next month!
              </p>
            </>
          )}

        </div>

        <p className="text-xs text-gray-300 mt-6">Woodlands Lodge Farmers Market</p>
      </div>
    </div>
  )
}
