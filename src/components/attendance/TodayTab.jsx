import { useState, useEffect, useCallback } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Th, Td, Toast, useFlash } from '../admin/AdminUI'
import {
  AT_MANAGE_ROLES, STATUS_CFG, ALL_STATUSES,
  todayStr, fmtDate, fmtTime, fmtDuration,
  breakMins, netMins, getShiftForDept, AccessDenied, StatusBadge,
} from './AttendanceUI'

const ELEVEN = 11  // hour threshold for "absent" vs "not arrived"

export default function TodayTab() {
  const { profile, session } = useAuth()
  const canManage = AT_MANAGE_ROLES.includes(profile?.role)

  if (!canManage) return <AccessDenied />

  const [users,        setUsers]        = useState([])
  const [recMap,       setRecMap]       = useState({})  // userId → record
  const [shifts,       setShifts]       = useState([])
  const [currentWeek,  setCurrentWeek]  = useState('A')
  const [weekCfgId,    setWeekCfgId]    = useState(null)
  const [deptFilter,   setDeptFilter]   = useState('')
  const [now,          setNow]          = useState(() => new Date())
  const [overrideModal,setOverrideModal]= useState(null) // { user, record }
  const [overrideVal,  setOverrideVal]  = useState('absent')
  const [noteModal,    setNoteModal]    = useState(null) // { user, record }
  const [noteVal,      setNoteVal]      = useState('')
  const [busy,         setBusy]         = useState(false)
  const [toast,        setToast]        = useState(null)
  const flash = useFlash(setToast)

  const today = todayStr()

  // ── data ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [usersR, recsR, shiftsR, weekR] = await Promise.all([
      supabaseAdmin.from('user_profiles').select('id, full_name, department, role').not('role', 'in', '("owner","manager")').order('department').order('full_name'),
      supabaseAdmin.from('attendance_records').select('*').eq('shift_date', today),
      supabaseAdmin.from('shift_settings').select('*').order('department').order('shift_name'),
      supabaseAdmin.from('bar_week_config').select('id, current_week').limit(1).single(),
    ])
    setUsers(usersR.data ?? [])
    const map = {}
    for (const r of (recsR.data ?? [])) map[r.user_id] = r
    setRecMap(map)
    setShifts(shiftsR.data ?? [])
    if (weekR.data) { setCurrentWeek(weekR.data.current_week); setWeekCfgId(weekR.data.id) }
  }, [today])

  useEffect(() => {
    load()
    const dataId = setInterval(load, 60000)
    const tickId = setInterval(() => setNow(new Date()), 60000)
    return () => { clearInterval(dataId); clearInterval(tickId) }
  }, [load])

  // ── derived ──────────────────────────────────────────────────────────────────

  function getShift(dept) { return getShiftForDept(dept, shifts, currentWeek, now) }

  function effectiveStatus(userId) {
    const rec = recMap[userId]
    if (rec) return rec.status
    return now.getHours() < ELEVEN ? 'not_arrived' : 'absent'
  }

  function liveHours(userId) {
    const rec = recMap[userId]
    if (!rec) return '—'
    return fmtDuration(netMins(rec, now))
  }

  function isOvertime(userId) {
    const rec = recMap[userId]
    if (!rec?.clock_in || rec?.clock_out) return false
    const user  = users.find(u => u.id === userId)
    const shift = getShift(user?.department)
    if (!shift?.shift_end) return false
    const [eh, em] = shift.shift_end.split(':').map(Number)
    const shiftEnd = new Date(now)
    shiftEnd.setHours(eh, em + 30, 0, 0)
    return now > shiftEnd
  }

  // Departments that have an active shift window right now but 0 present/late staff
  const coverageAlerts = (() => {
    const alerts = []
    const depts = [...new Set(shifts.map(s => s.department))]
    for (const dept of depts) {
      const shift = getShift(dept)
      if (!shift) continue
      const [sh, sm] = shift.shift_start.split(':').map(Number)
      const [eh, em] = shift.shift_end.split(':').map(Number)
      const nowMins  = now.getHours() * 60 + now.getMinutes()
      if (nowMins < sh * 60 + sm || nowMins > eh * 60 + em) continue
      const deptUsers  = users.filter(u => u.department === dept)
      const anyActive  = deptUsers.some(u => ['present', 'late'].includes(effectiveStatus(u.id)))
      if (!anyActive && deptUsers.length > 0) alerts.push(dept)
    }
    return alerts
  })()

  const allDepts    = [...new Set(users.map(u => u.department).filter(Boolean))].sort()
  const shownUsers  = deptFilter ? users.filter(u => u.department === deptFilter) : users
  const deptGroups  = shownUsers.reduce((acc, u) => {
    const d = u.department ?? u.role
    if (!acc[d]) acc[d] = []
    acc[d].push(u)
    return acc
  }, {})

  // Summary counts (across ALL users, regardless of dept filter)
  const counts = users.reduce((acc, u) => {
    const s = effectiveStatus(u.id)
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})

  // ── bar week toggle ──────────────────────────────────────────────────────────

  async function toggleWeek() {
    const next = currentWeek === 'A' ? 'B' : 'A'
    try {
      if (weekCfgId) {
        await supabaseAdmin.from('bar_week_config').update({
          current_week: next,
          updated_by:   session?.user?.id ?? null,
          updated_at:   new Date().toISOString(),
        }).eq('id', weekCfgId)
      } else {
        await supabaseAdmin.from('bar_week_config').insert({
          current_week: next,
          updated_by:   session?.user?.id ?? null,
        })
      }
      setCurrentWeek(next)
    } catch (err) { flash(err.message, false) }
  }

  // ── override / note actions ──────────────────────────────────────────────────

  async function handleOverride() {
    if (!overrideModal) return
    setBusy(true)
    try {
      const { user } = overrideModal
      const rec = recMap[user.id]
      if (rec) {
        const { error } = await supabaseAdmin.from('attendance_records')
          .update({ status: overrideVal }).eq('id', rec.id)
        if (error) throw error
      } else {
        const shift   = getShift(user.department)
        const clockIn = shift?.shift_start
          ? new Date(`${today}T${shift.shift_start}`).toISOString()
          : new Date(`${today}T08:00:00`).toISOString()
        const { error } = await supabaseAdmin.from('attendance_records').insert({
          user_id:    user.id,
          shift_date: today,
          clock_in:   clockIn,
          status:     overrideVal,
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
      const rec = recMap[user.id]
      if (rec) {
        const { error } = await supabaseAdmin.from('attendance_records')
          .update({ notes: noteVal || null }).eq('id', rec.id)
        if (error) throw error
      } else {
        const shift   = getShift(user.department)
        const clockIn = shift?.shift_start
          ? new Date(`${today}T${shift.shift_start}`).toISOString()
          : new Date(`${today}T08:00:00`).toISOString()
        const { error } = await supabaseAdmin.from('attendance_records').insert({
          user_id:    user.id,
          shift_date: today,
          clock_in:   clockIn,
          status:     'absent',
          notes:      noteVal || null,
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
        <h2 className="text-base font-semibold text-gray-800 mr-auto">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
          <span className="text-xs font-medium text-blue-700">Bar Staff: Week {currentWeek}</span>
          <button
            onClick={toggleWeek}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 underline ml-1"
          >
            Toggle
          </button>
        </div>
      </div>

      {/* Coverage alerts */}
      {coverageAlerts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {coverageAlerts.map(dept => (
            <span key={dept} className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-lg">
              ⚠ {dept}: no coverage
            </span>
          ))}
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { key: 'present',     label: 'Present',       cls: 'bg-green-50 border-green-100 text-green-800',    vCls: 'text-green-700' },
          { key: 'late',        label: 'Late',           cls: 'bg-amber-50 border-amber-100 text-amber-800',    vCls: 'text-amber-700' },
          { key: 'absent',      label: 'Absent',         cls: 'bg-red-50 border-red-100 text-red-800',          vCls: 'text-red-700'   },
          { key: 'unverified',  label: 'Unverified',     cls: 'bg-gray-50 border-gray-200 text-gray-600',       vCls: 'text-gray-700'  },
          { key: 'not_arrived', label: 'Not Yet Arrived',cls: 'bg-gray-50 border-gray-200 text-gray-500',       vCls: 'text-gray-600'  },
        ].map(({ key, label, cls, vCls }) => (
          <div key={key} className={`border rounded-xl p-3 ${cls}`}>
            <p className="text-xs mb-0.5 opacity-80">{label}</p>
            <p className={`text-xl font-bold ${vCls}`}>{counts[key] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Dept filter */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          <option value="">All departments</option>
          {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Department groups */}
      <div className="space-y-6">
        {Object.entries(deptGroups).map(([dept, members]) => (
          <div key={dept}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{dept}</p>
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <Th>Staff Name</Th>
                    <Th>Shift</Th>
                    <Th>Clock In</Th>
                    <Th>Clock Out</Th>
                    <Th>Hours</Th>
                    <Th>Break</Th>
                    <Th>Status</Th>
                    <Th>Radius</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(u => {
                    const rec      = recMap[u.id]
                    const shift    = getShift(u.department)
                    const effStatus = effectiveStatus(u.id)
                    const overtime  = isOvertime(u.id)
                    const shiftLabel = shift
                      ? `${fmtTime(shift.shift_start)} – ${fmtTime(shift.shift_end)}`
                      : '—'
                    const brk = rec ? breakMins(rec) : 0

                    return (
                      <tr key={u.id} className={`border-b border-gray-100 last:border-0 transition-colors ${
                        overtime ? 'bg-amber-50/50' : 'hover:bg-gray-50'
                      }`}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {u.full_name}
                          {overtime && <span className="ml-1.5 text-xs text-amber-500" title="Overtime (30+ min past shift end)">⏱</span>}
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
                        <td className="px-4 py-3"><StatusBadge status={effStatus} /></td>
                        <td className="px-4 py-3 text-sm">
                          {rec ? (
                            rec.within_radius === false
                              ? <span className="text-amber-500" title="Outside premises">⚑</span>
                              : <span className="text-green-500 text-xs">✓</span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => { setOverrideModal({ user: u, record: rec }); setOverrideVal(effStatus === 'not_arrived' ? 'absent' : effStatus) }}
                              className="text-xs font-medium px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition-colors"
                            >
                              Override
                            </button>
                            <button
                              onClick={() => { setNoteModal({ user: u, record: rec }); setNoteVal(rec?.notes ?? '') }}
                              className="text-xs font-medium px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-lg transition-colors"
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
          <p className="text-sm text-gray-400 py-6 text-center">No staff records found</p>
        )}
      </div>

      {/* Override status modal */}
      {overrideModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-semibold text-gray-900">Override Status</h4>
              <button onClick={() => setOverrideModal(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <p className="text-sm text-gray-600 mb-4">{overrideModal.user.full_name}</p>
            <select
              value={overrideVal}
              onChange={e => setOverrideVal(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 mb-4"
            >
              {ALL_STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_CFG[s].label}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button onClick={handleOverride} disabled={busy}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
                {busy ? 'Saving…' : 'Apply'}
              </button>
              <button onClick={() => setOverrideModal(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors">
                Cancel
              </button>
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={handleSaveNote} disabled={busy}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
                {busy ? 'Saving…' : 'Save Note'}
              </button>
              <button onClick={() => setNoteModal(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
