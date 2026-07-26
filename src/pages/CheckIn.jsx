import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmtDate } from '../components/farmers-market/FarmersMarketUI'

const SETUP_HOUR  = 7   // 07:30 — set-up deadline
const SETUP_MIN   = 30
const PACKUP_HOUR = 12  // 12:30 — pack-up deadline
const PACKUP_MIN  = 30

// All database access on this public route goes through the public-checkin
// Edge Function, which holds service_role server-side. The browser never
// touches fm_holders or fm_visits directly — see src/lib/standards.md §3.
async function callCheckIn(action, holderId) {
  const { data, error } = await supabase.functions.invoke('public-checkin', {
    body: { action, holder_id: holderId },
  })
  if (error) {
    // On a non-2xx the client hands back a FunctionsHttpError whose message is
    // generic ("Edge Function returned a non-2xx status code"). The useful text
    // is in the response body, so read it — otherwise a schema or key fault
    // reaches the user as an unexplained "Something went wrong", which is how
    // the missing checked_in_at column stayed invisible.
    let detail = error.message
    try {
      const body = await error.context?.json?.()
      if (body?.detail)     detail = `${body.error ?? 'Error'} — ${body.detail}`
      else if (body?.error) detail = body.error
    } catch { /* response body unreadable — keep the generic message */ }
    throw new Error(detail)
  }
  if (data?.error) throw new Error(data.error)
  return data
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

export default function CheckIn() {
  const [params]    = useSearchParams()
  const holderId    = params.get('holder')

  const [holder,    setHolder]    = useState(null)
  const [visit,     setVisit]     = useState(null)   // fm_visits row or null
  const [marketDay, setMarketDay] = useState(null)
  // phase: loading | not_found | no_market | check_in | checked_in | checked_out | error
  const [phase,     setPhase]     = useState('loading')
  const [busy,      setBusy]      = useState(false)
  // Underlying failure text, shown on the error screen. Without it every fault
  // — dead service key, missing column, network — looked identical.
  const [errorMsg,  setErrorMsg]  = useState(null)

  useEffect(() => {
    if (!holderId) { setPhase('not_found'); return }
    init()
  }, [holderId])

  async function init() {
    try {
      // The market day is decided server-side so a caller cannot fabricate
      // visits on arbitrary dates. December (no market) and "not within a day
      // of market day" both come back as no_market.
      const res = await callCheckIn('lookup', holderId)

      if (res?.not_found) { setPhase('not_found'); return }

      setHolder(res.holder)
      setMarketDay(res.market_day)

      if (res.no_market) { setPhase('no_market'); return }

      setVisit(res.visit)
      resolvePhase(res.visit)
    } catch (err) {
      setErrorMsg(err?.message ?? String(err))
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
      // Insert-or-update is decided server-side from the holder's existing
      // visit row for the market day.
      const res = await callCheckIn('check_in', holderId)
      setVisit(res.visit)
      setPhase('checked_in')
    } catch (err) {
      setErrorMsg(err?.message ?? String(err))
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }

  async function handleCheckOut() {
    if (!visit || busy) return
    setBusy(true)
    try {
      const res = await callCheckIn('check_out', holderId)
      setVisit(res.visit)
      setPhase('checked_out')
    } catch (err) {
      setErrorMsg(err?.message ?? String(err))
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
          {errorMsg && (
            <p className="mt-3 text-xs text-gray-400 font-mono break-words">{errorMsg}</p>
          )}
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
