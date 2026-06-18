import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import { getLastSaturdayOfMonth, fmtDate } from '../components/farmers-market/FarmersMarketUI'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function getRelevantMarketDay() {
  const now = new Date()
  return getLastSaturdayOfMonth(now.getFullYear(), now.getMonth())
}

function daysApart(a, b) {
  const msA = new Date(a + 'T12:00:00').getTime()
  const msB = new Date(b + 'T12:00:00').getTime()
  return Math.abs(Math.round((msA - msB) / 86400000))
}

export default function CheckIn() {
  const [params]   = useSearchParams()
  const holderId   = params.get('holder')

  const [holder,    setHolder]    = useState(null)
  const [marketDay, setMarketDay] = useState(null)
  const [status,    setStatus]    = useState('loading') // loading | not_found | not_market_day | ready | done | error
  const [already,   setAlready]   = useState(false)
  const [busy,      setBusy]      = useState(false)

  useEffect(() => {
    if (!holderId) { setStatus('not_found'); return }
    init()
  }, [holderId])

  async function init() {
    try {
      const { data: h, error } = await supabaseAdmin
        .from('fm_holders')
        .select('id, full_name, business_name, stall_number, stall_type, status')
        .eq('id', holderId)
        .single()

      if (error || !h || h.status === 'inactive') { setStatus('not_found'); return }
      setHolder(h)

      const md    = getRelevantMarketDay()
      const today = todayStr()
      if (daysApart(md, today) > 1) { setMarketDay(md); setStatus('not_market_day'); return }
      setMarketDay(md)

      const { data: visit } = await supabaseAdmin
        .from('fm_visits')
        .select('id')
        .eq('holder_id', holderId)
        .eq('visit_date', md)
        .maybeSingle()

      if (visit) setAlready(true)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }

  async function handleCheckIn() {
    if (already || busy) return
    setBusy(true)
    try {
      const { error } = await supabaseAdmin.from('fm_visits').insert({
        holder_id:     holderId,
        visit_date:    marketDay,
        checked_in_by: null,
        fee_paid:      false,
      })
      if (error) throw error
      setAlready(true)
      setStatus('done')
    } catch {
      setStatus('error')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  if (status === 'not_found') {
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

  if (status === 'error') {
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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center space-y-5">

        {/* Holder info */}
        <div>
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl font-bold text-green-700 uppercase">
              {holder?.full_name?.charAt(0) ?? '?'}
            </span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{holder?.full_name}</h1>
          {holder?.business_name && (
            <p className="text-sm text-gray-500 mt-0.5">{holder.business_name}</p>
          )}
          <p className="text-sm text-gray-600 mt-1">
            Stall {holder?.stall_number} · {holder?.stall_type}
          </p>
        </div>

        {/* Status / action */}
        <div className="border-t border-gray-100 pt-5">
          {status === 'not_market_day' && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700">No market day today</p>
              <p className="text-xs text-gray-400 mt-1">
                Next market day: {fmtDate(marketDay)}
              </p>
            </div>
          )}

          {status === 'ready' && already && (
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-sm font-medium text-blue-700">Already checked in today</p>
              <p className="text-xs text-gray-400 mt-1">{fmtDate(marketDay)}</p>
            </div>
          )}

          {status === 'done' && (
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-2xl mb-1">✓</p>
              <p className="text-sm font-semibold text-green-700">Checked in successfully!</p>
              <p className="text-xs text-gray-400 mt-1">{fmtDate(marketDay)}</p>
            </div>
          )}

          {status === 'ready' && !already && (
            <button
              onClick={handleCheckIn}
              disabled={busy}
              className="w-full bg-brand-teal hover:bg-brand-teal-dark text-white font-semibold py-3.5 rounded-xl text-base transition-colors disabled:opacity-60"
            >
              {busy ? 'Checking in…' : 'Check In'}
            </button>
          )}
        </div>

        <p className="text-xs text-gray-300">Woodlands Lodge Farmers Market</p>
      </div>
    </div>
  )
}
