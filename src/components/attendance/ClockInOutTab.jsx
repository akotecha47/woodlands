import { useState, useEffect, useCallback } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Toast, useFlash } from '../admin/AdminUI'
import {
  LODGE_LAT, LODGE_LNG, RADIUS_M,
  haversineM, getPosition, fmtTime, fmtDuration,
  breakMins, netMins, getShiftForUser, isLate,
} from './AttendanceUI'

const GPS_TIMEOUT_MS = 5000

// Wraps getPosition() in a 5-second timeout
function getPositionWithTimeout() {
  return Promise.race([
    getPosition(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), GPS_TIMEOUT_MS)
    ),
  ])
}

export default function ClockInOutTab() {
  const { profile, session } = useAuth()

  const [record,      setRecord]      = useState(null)
  const [shift,       setShift]       = useState(null)
  const [now,         setNow]         = useState(() => new Date())
  const [gpsStatus,   setGpsStatus]   = useState(null)   // 'ok' | 'outside' | 'offline'
  const [gpsMessage,  setGpsMessage]  = useState('')
  const [gpsWaiting,  setGpsWaiting]  = useState(false)
  const [busy,        setBusy]        = useState(false)
  const [toast,       setToast]       = useState(null)
  const flash = useFlash(setToast)

  const today = new Date().toISOString().split('T')[0]

  // ── data ──────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!session?.user?.id) return

    const [recR, shiftsR] = await Promise.all([
      supabaseAdmin.from('attendance_records')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('date', today)
        .maybeSingle(),
      supabaseAdmin.from('shift_settings').select('*'),
    ])

    setRecord(recR.data ?? null)

    // Use user's own shift_name and bar_week for accurate shift lookup
    const s = getShiftForUser(profile, shiftsR.data ?? [], profile?.bar_week ?? 'A', new Date())
    setShift(s ?? null)
  }, [session?.user?.id, today, profile])

  useEffect(() => {
    load()
    const tickId = setInterval(() => setNow(new Date()), 5000)
    return () => clearInterval(tickId)
  }, [load])

  // ── derived state ─────────────────────────────────────────────────────────────

  const onBreak    = !!record?.break_start && !record?.break_end
  const clocked_out = !!record?.clock_out
  const phase = !record ? 'idle' : clocked_out ? 'done' : onBreak ? 'break' : 'working'

  const shiftLabel = shift
    ? `${fmtTime(shift.shift_start)} – ${fmtTime(shift.shift_end)}`
    : 'No shift assigned'

  const liveNet    = phase === 'working' ? fmtDuration(netMins(record, now)) : null
  const finalNet   = phase === 'done'    ? fmtDuration(netMins(record))      : null
  const finalBreak = phase === 'done'    ? breakMins(record)                 : null

  // ── GPS + clock-in ───────────────────────────────────────────────────────────

  async function handleClockIn() {
    setBusy(true)
    setGpsStatus(null)
    setGpsMessage('')

    const { data: existing } = await supabaseAdmin
      .from('attendance_records')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('date', today)
      .maybeSingle()

    if (existing) {
      flash('Already clocked in today', false)
      setBusy(false)
      return
    }

    let lat = null, lng = null, withinRadius = false, status = 'unverified'

    setGpsWaiting(true)
    try {
      const pos = await getPositionWithTimeout()
      lat = pos.coords.latitude
      lng = pos.coords.longitude
      const dist = haversineM(lat, lng, LODGE_LAT, LODGE_LNG)
      withinRadius = dist <= RADIUS_M

      if (!withinRadius) {
        setGpsStatus('outside')
        setGpsMessage(`You appear to be outside Woodlands Lodge premises (${Math.round(dist)}m away). Your clock-in will be flagged for manager review.`)
        status = 'unverified'
      } else {
        setGpsStatus('ok')
        status = isLate(new Date().toISOString(), shift) ? 'late' : 'present'
        withinRadius = true
      }
    } catch {
      setGpsStatus('offline')
      setGpsMessage('Location unavailable — clocking in without GPS verification. Your attendance will be flagged for review.')
      status = 'unverified'
      withinRadius = false
    } finally {
      setGpsWaiting(false)
    }

    try {
      const { data, error } = await supabaseAdmin.from('attendance_records').insert({
        user_id:       session.user.id,
        date:          today,
        clock_in:      new Date().toISOString(),
        clock_in_lat:  lat,
        clock_in_lng:  lng,
        within_radius: withinRadius,
        status,
      }).select().single()
      if (error) throw error
      setRecord(data)
      if (withinRadius) flash(`Clocked in at ${fmtTime(data.clock_in)} ✓`)
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function handleStartBreak() {
    setBusy(true)
    try {
      const { data, error } = await supabaseAdmin.from('attendance_records')
        .update({ break_start: new Date().toISOString() })
        .eq('id', record.id).select().single()
      if (error) throw error
      setRecord(data)
      flash('Break started')
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function handleEndBreak() {
    setBusy(true)
    try {
      const { data, error } = await supabaseAdmin.from('attendance_records')
        .update({ break_end: new Date().toISOString() })
        .eq('id', record.id).select().single()
      if (error) throw error
      setRecord(data)
      flash('Break ended')
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function handleClockOut() {
    setBusy(true)
    try {
      const { data, error } = await supabaseAdmin.from('attendance_records')
        .update({ clock_out: new Date().toISOString() })
        .eq('id', record.id).select().single()
      if (error) throw error
      setRecord(data)
      flash('Clocked out ✓')
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-lg mx-auto">
      <Toast toast={toast} />

      {/* User info */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
        <p className="text-base font-semibold text-gray-900">{profile?.full_name ?? 'You'}</p>
        <p className="text-sm text-gray-500 mt-0.5">
          {profile?.department ?? '—'} · {profile?.shift_name ?? profile?.role ?? '—'}
          {profile?.bar_week ? ` · Week ${profile.bar_week}` : ''}
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Your shift today: <span className="font-medium text-gray-600">{shiftLabel}</span>
        </p>
      </div>

      {/* GPS messages */}
      {gpsWaiting && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-center gap-3 text-sm text-blue-700">
          <svg className="animate-spin h-4 w-4 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Getting your location…
        </div>
      )}
      {gpsStatus === 'outside' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-800">
          ⚠ {gpsMessage}
        </div>
      )}
      {gpsStatus === 'offline' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-700">
          ℹ {gpsMessage}
        </div>
      )}

      {/* ── State: idle ───────────────────────────────────────── */}
      {phase === 'idle' && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 mb-6">You have not clocked in today.</p>
          <button
            onClick={handleClockIn}
            disabled={busy}
            className="w-full max-w-xs bg-brand-teal hover:bg-brand-teal-dark text-white font-semibold text-lg py-4 rounded-2xl transition-colors disabled:opacity-60 shadow-sm"
          >
            {busy ? 'Clocking in…' : '🟢 Clock In'}
          </button>
        </div>
      )}

      {/* ── State: working ────────────────────────────────────── */}
      {phase === 'working' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs text-green-600 font-medium uppercase tracking-wide mb-1">Clocked in</p>
            <p className="text-2xl font-bold text-green-800 font-mono">{liveNet}</p>
            <p className="text-xs text-gray-500 mt-1">Since {fmtTime(record.clock_in)}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleStartBreak} disabled={busy}
              className="flex-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-medium py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60">
              Start Break
            </button>
            <button onClick={handleClockOut} disabled={busy}
              className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60">
              {busy ? 'Saving…' : 'Clock Out'}
            </button>
          </div>
        </div>
      )}

      {/* ── State: break ──────────────────────────────────────── */}
      {phase === 'break' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs text-amber-600 font-medium uppercase tracking-wide mb-1">On Break</p>
            <p className="text-lg font-semibold text-amber-800">Since {fmtTime(record.break_start)}</p>
          </div>
          <button onClick={handleEndBreak} disabled={busy}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl text-sm transition-colors disabled:opacity-60">
            {busy ? 'Saving…' : 'End Break'}
          </button>
        </div>
      )}

      {/* ── State: done ───────────────────────────────────────── */}
      {phase === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
          <p className="text-sm font-semibold text-green-700 mb-1">✓ Shift complete</p>
          {[
            ['Clock In',  fmtTime(record.clock_in)],
            ['Clock Out', fmtTime(record.clock_out)],
            ['Break',     finalBreak ? `${finalBreak} min` : 'None'],
            ['Net Hours', finalNet],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-500">{label}</span>
              <span className="font-medium text-gray-900">{value ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
