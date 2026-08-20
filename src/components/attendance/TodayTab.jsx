import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Th, Td, Toast, Sel, Button } from '../admin/AdminUI'
import { AT_MANAGE_ROLES, MANAGE_ROLES } from '../../lib/roles'
import {
  STATUS_CFG, ALL_STATUSES,
  todayStr, fmtDate, fmtTime, fmtDuration,
  breakMins, netMins, getShiftForDept, minsLateCalc,
  AccessDenied, StatusBadge,
} from './AttendanceUI'
import { useFlash } from '../ui/useFlash'

const ELEVEN = 11

export default function TodayTab() {
  const { profile, session } = useAuth()
  const canManage = AT_MANAGE_ROLES.includes(profile?.role)

  if (!canManage) return <AccessDenied />

  const [staffList,       setStaffList]       = useState([])
  const [recMap,          setRecMap]          = useState({})
  const [shifts,          setShifts]          = useState([])
  const [deptFilter,      setDeptFilter]      = useState('')
  const [now,             setNow]             = useState(() => new Date())
  const [overrideModal,   setOverrideModal]   = useState(null)
  const [overrideVal,     setOverrideVal]     = useState('absent')
  const [noteModal,       setNoteModal]       = useState(null)
  const [noteVal,         setNoteVal]         = useState('')
  const [confirmAbsent,   setConfirmAbsent]   = useState(false)
  const [consecutiveAlert,setConsecutiveAlert]= useState([])
  const [busy,            setBusy]            = useState(false)
  const [toast,           setToast]           = useState(null)
  const flash = useFlash(setToast)

  const today = todayStr()
  const afterEleven = now.getHours() >= ELEVEN

  // ── data ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [usersR, recsR, shiftsR, recentR] = await Promise.all([
      supabase
        .from('staff')
        .select('id, full_name, department, position, shift_start, shift_end, is_active')
        .eq('is_active', true)
        .order('department').order('full_name'),
      supabase.from('attendance_records').select('*')
        .eq('shift_date', today)
        .not('staff_id', 'is', null),
      supabase.from('shift_settings').select('*').order('department').order('shift_name'),
      supabase.from('attendance_records')
        .select('staff_id, shift_date, status')
        .gte('shift_date', offsetDate(-3))
        .lt('shift_date', today)
        .not('staff_id', 'is', null)
        .order('shift_date', { ascending: false }),
    ])

    const loaded = usersR.data ?? []
    setStaffList(loaded)

    const map = {}
    for (const r of (recsR.data ?? [])) {
      if (r.staff_id) map[r.staff_id] = r
    }
    setRecMap(map)
    setShifts(shiftsR.data ?? [])

    // ── consecutive absence detection ────────────────────────────────────────
    const recentByStaff = {}
    for (const r of (recentR.data ?? [])) {
      if (!r.staff_id) continue
      if (!recentByStaff[r.staff_id]) recentByStaff[r.staff_id] = []
      recentByStaff[r.staff_id].push(r)
    }
    const alerts = []
    for (const u of loaded) {
      const recs = (recentByStaff[u.id] ?? []).slice(0, 3)
      let streak = 0
      for (const r of recs) {
        if (r.status === 'absent') streak++
        else break
      }
      if (streak >= 2) alerts.push({ name: u.full_name, days: streak })
    }
    setConsecutiveAlert(alerts)
  }, [today])

  useEffect(() => {
    load()
    const dataId = setInterval(load, 60000)
    const tickId = setInterval(() => setNow(new Date()), 60000)
    return () => { clearInterval(dataId); clearInterval(tickId) }
  }, [load])

  // ── derived ──────────────────────────────────────────────────────────────────

  function getShift(user) {
    return getShiftForDept(user.department, shifts, 'A', now)
  }

  function effectiveStatus(staffId) {
    const rec = recMap[staffId]
    if (rec) return rec.status
    return now.getHours() < ELEVEN ? 'not_arrived' : 'absent'
  }

  function liveHours(staffId) {
    const rec = recMap[staffId]
    if (!rec) return '—'
    return fmtDuration(netMins(rec, now))
  }

  function isOvertime(staffId) {
    const rec = recMap[staffId]
    if (!rec?.clock_in || rec?.clock_out) return false
    const user  = staffList.find(u => u.id === staffId)
    const shift = getShift(user)
    if (!shift?.shift_end) return false
    const [eh, em] = shift.shift_end.split(':').map(Number)
    const shiftEnd = new Date(now)
    shiftEnd.setHours(eh, em + 30, 0, 0)
    return now > shiftEnd
  }

  // Coverage alerts — no active staff during a live shift window
  const coverageAlerts = (() => {
    const alerts = []
    const depts = [...new Set(shifts.map(s => s.department))]
    for (const dept of depts) {
      const deptShifts = shifts.filter(s => s.department === dept)
      if (deptShifts.length === 0) continue
      const s = deptShifts[0]
      const [sh, sm] = s.shift_start.split(':').map(Number)
      const [eh, em] = s.shift_end.split(':').map(Number)
      const nowMins  = now.getHours() * 60 + now.getMinutes()
      if (nowMins < sh * 60 + sm || nowMins > eh * 60 + em) continue
      const deptStaff = staffList.filter(u => u.department === dept)
      const anyActive = deptStaff.some(u => ['present', 'late'].includes(effectiveStatus(u.id)))
      if (!anyActive && deptStaff.length > 0) alerts.push(dept)
    }
    return alerts
  })()

  const allDepts   = [...new Set(staffList.map(u => u.department).filter(Boolean))].sort()
  const shownUsers = deptFilter ? staffList.filter(u => u.department === deptFilter) : staffList
  const deptGroups = shownUsers.reduce((acc, u) => {
    const d = u.department ?? 'Unknown'
    if (!acc[d]) acc[d] = []
    acc[d].push(u)
    return acc
  }, {})

  const counts = staffList.reduce((acc, u) => {
    const s = effectiveStatus(u.id)
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})

  // ── mark all absent ──────────────────────────────────────────────────────────

  async function handleMarkAllAbsent() {
    setBusy(true)
    setConfirmAbsent(false)
    try {
      const unclockedStaff = staffList.filter(u => !recMap[u.id])
      const inserts = unclockedStaff.map(u => ({
        staff_id:   u.id,
        // `date` is NOT NULL with no default in the live table, and every
        // manager-path insert omitted it — see handleOverride below.
        date:       today,
        shift_date: today,
        clock_in:   null,
        status:     'absent',
      }))
      if (inserts.length === 0) { flash('All staff already have records for today'); return }
      const { error } = await supabase.from('attendance_records').insert(inserts)
      if (error) throw error
      flash(`${inserts.length} staff marked absent`)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  // ── override / note ──────────────────────────────────────────────────────────

  async function handleOverride() {
    if (!overrideModal) return
    setBusy(true)
    try {
      const { user } = overrideModal
      const rec   = recMap[user.id]
      const shift = getShift(user)
      if (rec) {
        const { error } = await supabase.from('attendance_records')
          .update({ status: overrideVal }).eq('id', rec.id)
        if (error) throw error
      } else {
        const clockIn = shift?.shift_start
          ? new Date(`${today}T${shift.shift_start}`).toISOString()
          : new Date(`${today}T08:00:00`).toISOString()
        // `date` is NOT NULL with no default in the live table (verified
        // against the live DDL, which matches seed.sql rather than
        // 010_attendance_user_id.sql). Every manager-path insert set only
        // shift_date, so Override, Mark All Absent and Save Note all failed
        // with "null value in column 'date' violates not-null constraint".
        //
        // Both columns are set to the same value deliberately: this tab reads
        // and filters on shift_date, while ClockInOutTab and OwnerDashboard
        // filter on date. Writing one and not the other is what made the two
        // attendance write paths structurally disjoint (AUDIT_2 §3 DoD 6(e)).
        const { error } = await supabase.from('attendance_records').insert({
          staff_id: user.id, date: today, shift_date: today,
          clock_in: clockIn, status: overrideVal,
        })
        if (error) throw error
      }
      flash('Status updated')
      setOverrideModal(null)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function handleSaveNote() {
    if (!noteModal) return
    setBusy(true)
    try {
      const { user } = noteModal
      const rec   = recMap[user.id]
      const shift = getShift(user)
      if (rec) {
        const { error } = await supabase.from('attendance_records')
          .update({ notes: noteVal || null }).eq('id', rec.id)
        if (error) throw error
      } else {
        const clockIn = shift?.shift_start
          ? new Date(`${today}T${shift.shift_start}`).toISOString()
          : new Date(`${today}T08:00:00`).toISOString()
        const { error } = await supabase.from('attendance_records').insert({
          staff_id: user.id, date: today, shift_date: today, clock_in: clockIn,
          status: 'absent', notes: noteVal || null,
        })
        if (error) throw error
      }
      flash('Note saved')
      setNoteModal(null)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <Toast toast={toast} />

      {/* Header */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <h2 className="text-[15px] font-bold text-navy mr-auto">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </h2>
        {afterEleven && MANAGE_ROLES.includes(profile?.role) && (
          <button
            onClick={() => setConfirmAbsent(true)}
            disabled={busy}
            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-medium wl-transition disabled:opacity-60"
          >
            Mark All Absent
          </button>
        )}
      </div>

      {/* Consecutive absence alert */}
      {consecutiveAlert.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
          ⚠ Consecutive absences:{' '}
          {consecutiveAlert.map((a, i) => (
            <span key={a.name}>
              {i > 0 && ', '}
              <strong>{a.name}</strong> ({a.days} day{a.days !== 1 ? 's' : ''})
            </span>
          ))}
        </div>
      )}

      {/* Coverage alerts */}
      {coverageAlerts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {coverageAlerts.map(dept => (
            <span key={dept} className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-md">
              ⚠ {dept}: no coverage
            </span>
          ))}
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { key: 'present',     label: 'Present',        cls: 'bg-green-50 border-green-100 text-green-800',  vCls: 'text-green-700' },
          { key: 'late',        label: 'Late',            cls: 'bg-amber-50 border-amber-100 text-amber-800',  vCls: 'text-amber-700' },
          { key: 'absent',      label: 'Absent',          cls: 'bg-red-50 border-red-100 text-red-800',        vCls: 'text-red-700'   },
          { key: 'unverified',  label: 'Unverified',      cls: 'bg-gray-50 border-gray-200 text-gray-600',     vCls: 'text-gray-700'  },
          { key: 'not_arrived', label: 'Not Yet Arrived', cls: 'bg-gray-50 border-gray-200 text-gray-500',     vCls: 'text-gray-600'  },
        ].map(({ key, label, cls, vCls }) => (
          <div key={key} className={`border rounded-xl p-3 ${cls}`}>
            <p className="text-xs mb-0.5 opacity-80">{label}</p>
            <p className={`text-xl font-bold ${vCls}`}>{counts[key] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Dept filter */}
      <div className="flex items-center gap-3 mb-4">
        <Sel
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          aria-label="Filter by department"
          wrapClassName="w-48"
        >
          <option value="">All departments</option>
          {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
        </Sel>
      </div>

      {/* Department groups */}
      <div className="space-y-6">
        {Object.entries(deptGroups).map(([dept, members]) => (
          <div key={dept}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{dept}</p>
            <div className="wl-scroll-x border border-line rounded-xl bg-white">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-line">
                    <Th>Staff Name</Th>
                    <Th>Shift</Th>
                    <Th>Clock In</Th>
                    <Th>Clock Out</Th>
                    <Th>Hours</Th>
                    <Th>Break</Th>
                    <Th>Status</Th>
                    {/* BLOCK 3 / H — the Radius column is HIDDEN, not deleted.
                        It reported `attendance_records.within_radius`, the GPS
                        geofence check, and every one of the 15 live rows is
                        manager-written with no GPS reading at all, so the column
                        printed an em dash on every line under a header that
                        promised a verdict. Automated capture is PARKED, not
                        removed (CLAUDE.md): the column, the data and
                        `within_radius` itself all stay exactly where they are,
                        and this display comes back the day a capture path does. */}
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(u => {
                    const rec        = recMap[u.id]
                    const shift      = getShift(u)
                    const effStatus  = effectiveStatus(u.id)
                    const overtime   = isOvertime(u.id)
                    const shiftLabel = shift
                      ? `${fmtTime(shift.shift_start)} – ${fmtTime(shift.shift_end)}`
                      : '—'
                    const brk        = rec ? breakMins(rec) : 0
                    const late       = effStatus === 'late' ? minsLateCalc(rec?.clock_in, shift) : null
                    const hasConsecutive = consecutiveAlert.some(a => a.name === u.full_name)

                    return (
                      <tr key={u.id} className={`border-b border-line last:border-0 wl-transition ${
                        overtime ? 'bg-amber-50/50' : 'hover:bg-gray-50'
                      }`}>
                        <td className="px-4 py-3 text-sm font-semibold text-navy">
                          {hasConsecutive && <span className="mr-1 text-red-500" title="Consecutive absences">●</span>}
                          {u.full_name}
                          {overtime && <span className="ml-1.5 text-xs text-amber-500" title="Overtime">⏱</span>}
                        </td>
                        <Td>{shiftLabel}</Td>
                        <Td>{rec ? fmtTime(rec.clock_in) : null}</Td>
                        <Td>{rec ? fmtTime(rec.clock_out) : null}</Td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-700">
                          {rec && !rec.clock_out
                            ? <span className="text-green-600 font-medium">{liveHours(u.id)}</span>
                            : liveHours(u.id)}
                        </td>
                        <Td>{brk > 0 ? `${brk}m` : null}</Td>
                        <td className="px-4 py-3">
                          <StatusBadge status={effStatus} minsLate={late} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => { setOverrideModal({ user: u, record: rec }); setOverrideVal(effStatus === 'not_arrived' ? 'absent' : effStatus) }}
                              className="text-xs font-medium px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg wl-transition"
                            >
                              Override
                            </button>
                            <button
                              onClick={() => { setNoteModal({ user: u, record: rec }); setNoteVal(rec?.notes ?? '') }}
                              className="text-xs font-medium px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-lg wl-transition"
                            >
                              Note
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {shownUsers.length === 0 && (
          <p className="text-sm text-ink-soft py-10 text-center">No staff on the roster for this filter. Clear it, or add staff under Admin → Staff.</p>
        )}
      </div>

      {/* Mark All Absent confirmation */}
      {confirmAbsent && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h4 className="text-base font-semibold text-gray-900 mb-3">Mark All Absent?</h4>
            <p className="text-sm text-gray-600 mb-5">
              Mark all staff with no clock-in today as Absent? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="danger" onClick={handleMarkAllAbsent} disabled={busy} className="flex-1">
                {busy ? 'Marking…' : 'Mark Absent'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmAbsent(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Override status modal */}
      {overrideModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-semibold text-gray-900">Override Status</h4>
              <button onClick={() => setOverrideModal(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <p className="text-sm text-gray-600 mb-4">{overrideModal.user.full_name}</p>
            <Sel
              value={overrideVal}
              onChange={e => setOverrideVal(e.target.value)}
              aria-label="Status to apply"
              wrapClassName="mb-4"
            >
              {ALL_STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_CFG[s].label}</option>
              ))}
            </Sel>
            <div className="flex gap-3">
              <Button onClick={handleOverride} disabled={busy} className="flex-1">
                {busy ? 'Saving…' : 'Apply'}
              </Button>
              <Button variant="secondary" onClick={() => setOverrideModal(null)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Note modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-semibold text-gray-900">Add Note</h4>
              <button onClick={() => setNoteModal(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <p className="text-sm text-gray-600 mb-3">{noteModal.user.full_name}</p>
            <textarea
              rows={3}
              value={noteVal}
              onChange={e => setNoteVal(e.target.value)}
              placeholder="Notes for today's attendance record…"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm wl-transition hover:border-gray-400 focus:border-teal focus:ring-2 focus:ring-teal/25 resize-none mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <Button onClick={handleSaveNote} disabled={busy} className="flex-1">
                {busy ? 'Saving…' : 'Save Note'}
              </Button>
              <Button variant="secondary" onClick={() => setNoteModal(null)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function offsetDate(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
