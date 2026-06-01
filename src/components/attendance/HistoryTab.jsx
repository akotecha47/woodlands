import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Th, Td, Toast, useFlash } from '../admin/AdminUI'
import {
  AT_MANAGE_ROLES, STATUS_CFG, ALL_STATUSES,
  todayStr, fmtDate, fmtTime, fmtDuration, fmtLate,
  breakMins, netMins, getShiftForUser, minsLateCalc,
  AccessDenied, StatusBadge,
} from './AttendanceUI'

function offsetDate(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function weekMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function weekLabel(monday) {
  const end = new Date(monday + 'T12:00:00')
  end.setDate(end.getDate() + 6)
  return `${fmtDate(monday)} – ${fmtDate(end.toISOString().slice(0, 10))}`
}

// Average of timestamps — returns "HH:MM" or null
function avgTime(timestamps) {
  const valid = timestamps.filter(Boolean)
  if (valid.length === 0) return null
  const minsArr = valid.map(ts => {
    const d = new Date(ts)
    return d.getHours() * 60 + d.getMinutes()
  })
  const avg = Math.round(minsArr.reduce((s, v) => s + v, 0) / minsArr.length)
  return `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`
}

export default function HistoryTab() {
  const { profile } = useAuth()
  const canManage = AT_MANAGE_ROLES.includes(profile?.role)

  if (!canManage) return <AccessDenied />

  const [records,      setRecords]      = useState([])
  const [userMap,      setUserMap]      = useState({})
  const [shifts,       setShifts]       = useState([])
  const [staffList,    setStaffList]    = useState([])
  const [allDepts,     setAllDepts]     = useState([])
  const [filterStaff,  setFilterStaff]  = useState('')
  const [filterDept,   setFilterDept]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterFrom,   setFilterFrom]   = useState(offsetDate(-13))
  const [filterTo,     setFilterTo]     = useState(todayStr())
  const [weeklyView,   setWeeklyView]   = useState(false)
  const [toast,        setToast]        = useState(null)
  const flash = useFlash(setToast)

  async function load() {
    const [recsR, usersR, shiftsR, deptsR] = await Promise.all([
      supabaseAdmin.from('attendance_records')
        .select('*')
        .gte('shift_date', filterFrom)
        .lte('shift_date', filterTo)
        .order('shift_date', { ascending: false })
        .order('clock_in',   { ascending: false }),
      // Exclude owner/manager — same staff list as Today tab
      supabaseAdmin.from('user_profiles')
        .select('id, full_name, department, shift_name, bar_week')
        .not('role', 'in', '("owner","manager")')
        .order('full_name'),
      supabaseAdmin.from('shift_settings').select('*'),
      supabaseAdmin.from('departments').select('name').order('name'),
    ])

    const um = {}
    for (const u of (usersR.data ?? [])) um[u.id] = u
    setUserMap(um)
    setStaffList(usersR.data ?? [])
    setShifts(shiftsR.data ?? [])
    setAllDepts((deptsR.data ?? []).map(d => d.name))

    let recs = recsR.data ?? []
    if (filterStaff)  recs = recs.filter(r => r.user_id === filterStaff)
    if (filterDept)   recs = recs.filter(r => um[r.user_id]?.department === filterDept)
    if (filterStatus) recs = recs.filter(r => r.status === filterStatus)
    setRecords(recs)
  }

  useEffect(() => { load() }, [filterFrom, filterTo, filterStaff, filterDept, filterStatus])

  // ── Daily view grouped by ISO week ──────────────────────────────────────────

  const weeks = records.reduce((acc, r) => {
    const wk = weekMonday(r.shift_date)
    if (!acc[wk]) acc[wk] = []
    acc[wk].push(r)
    return acc
  }, {})

  // ── Weekly summary view ──────────────────────────────────────────────────────
  // Group by (user_id, iso_week_monday) → one row per person per week

  const weeklySummaryRows = (() => {
    const buckets = {}
    for (const r of records) {
      const wk  = weekMonday(r.shift_date)
      const key = `${r.user_id}::${wk}`
      if (!buckets[key]) buckets[key] = { user_id: r.user_id, wk, recs: [] }
      buckets[key].recs.push(r)
    }
    return Object.values(buckets).sort((a, b) =>
      b.wk.localeCompare(a.wk) || (userMap[a.user_id]?.full_name ?? '').localeCompare(userMap[b.user_id]?.full_name ?? '')
    )
  })()

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <Toast toast={toast} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Staff</label>
          <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal w-44">
            <option value="">All staff</option>
            {staffList.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal">
            <option value="">All departments</option>
            {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal">
            <option value="">All statuses</option>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
        {(filterStaff || filterDept || filterStatus) && (
          <button
            onClick={() => { setFilterStaff(''); setFilterDept(''); setFilterStatus('') }}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded-lg self-end">
            Clear
          </button>
        )}
        <span className="text-xs text-gray-400 self-end pb-1.5 ml-auto">
          {records.length} record{records.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Weekly Summary toggle */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => setWeeklyView(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            weeklyView
              ? 'bg-brand-teal text-white border-brand-teal'
              : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
          }`}
        >
          Weekly Summary
        </button>
        {weeklyView && (
          <span className="text-xs text-gray-400">One row per person per week</span>
        )}
      </div>

      {records.length === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">No records found</p>
      )}

      {/* ── Weekly Summary view ─────────────────────────────────────────────── */}
      {weeklyView && records.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <Th>Staff Name</Th>
                <Th>Department</Th>
                <Th>Week</Th>
                <Th>Present</Th>
                <Th>Late</Th>
                <Th>Absent</Th>
                <Th>Total Hours</Th>
                <Th>Avg Clock-in</Th>
              </tr>
            </thead>
            <tbody>
              {weeklySummaryRows.map(({ user_id, wk, recs: wkRecs }) => {
                const user    = userMap[user_id]
                const present = wkRecs.filter(r => r.status === 'present').length
                const late    = wkRecs.filter(r => r.status === 'late').length
                const absent  = wkRecs.filter(r => r.status === 'absent').length
                const totalMins = wkRecs.map(r => netMins(r) ?? 0).reduce((s, v) => s + v, 0)
                const avgIn   = avgTime(wkRecs.map(r => r.clock_in))
                return (
                  <tr key={`${user_id}::${wk}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{user?.full_name ?? '—'}</td>
                    <Td>{user?.department ?? '—'}</Td>
                    <Td>{weekLabel(wk)}</Td>
                    <td className="px-4 py-3 text-sm text-green-700 font-medium">{present}</td>
                    <td className="px-4 py-3 text-sm text-amber-600 font-medium">{late}</td>
                    <td className="px-4 py-3 text-sm text-red-600 font-medium">{absent}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-800">{fmtDuration(totalMins)}</td>
                    <Td>{avgIn ?? '—'}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Daily view grouped by week ──────────────────────────────────────── */}
      {!weeklyView && records.length > 0 && (
        <div className="space-y-6">
          {Object.entries(weeks).map(([wkMonday, wkRecords]) => {
            const wkEnd = new Date(wkMonday + 'T12:00:00')
            wkEnd.setDate(wkEnd.getDate() + 6)
            const totalWeekMins = wkRecords.map(r => netMins(r) ?? 0).reduce((s, v) => s + v, 0)

            return (
              <div key={wkMonday}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                  Week of {fmtDate(wkMonday)} – {fmtDate(wkEnd.toISOString().slice(0, 10))}
                </p>
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <Th>Date</Th>
                        <Th>Staff Name</Th>
                        <Th>Department</Th>
                        <Th>Shift</Th>
                        <Th>Clock In</Th>
                        <Th>Clock Out</Th>
                        <Th>Break</Th>
                        <Th>Net Hours</Th>
                        <Th>Mins Late</Th>
                        <Th>Status</Th>
                        <Th>Radius</Th>
                        <Th>Notes</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {wkRecords.map(r => {
                        const user      = userMap[r.user_id]
                        const shift     = getShiftForUser(user, shifts, user?.bar_week ?? 'A')
                        const shiftLabel = shift
                          ? `${fmtTime(shift.shift_start)} – ${fmtTime(shift.shift_end)}`
                          : '—'
                        const brk       = breakMins(r)
                        const net       = netMins(r)
                        const late      = r.status === 'late' ? minsLateCalc(r.clock_in, shift) : null
                        return (
                          <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                            <Td>{fmtDate(r.shift_date)}</Td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{user?.full_name ?? '—'}</td>
                            <Td>{user?.department ?? '—'}</Td>
                            <Td>{shiftLabel}</Td>
                            <Td>{fmtTime(r.clock_in)}</Td>
                            <td className="px-4 py-3 text-sm">
                              {r.clock_out
                                ? <span className="text-gray-600">{fmtTime(r.clock_out)}</span>
                                : <span className="text-green-600 font-medium text-xs">Active</span>}
                            </td>
                            <Td>{brk > 0 ? `${brk}m` : null}</Td>
                            <td className="px-4 py-3 text-sm font-mono text-gray-700">
                              {r.clock_out ? fmtDuration(net) : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-amber-600 font-medium">
                              {late ? fmtLate(late) : null}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={r.status} minsLate={late} /></td>
                            <td className="px-4 py-3 text-sm">
                              {r.within_radius === false
                                ? <span className="text-amber-500" title="Outside premises">⚑</span>
                                : r.within_radius === true
                                ? <span className="text-green-500 text-xs">✓</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate" title={r.notes ?? ''}>
                              {r.notes ?? null}
                            </td>
                          </tr>
                        )
                      })}

                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={7} className="px-4 py-2 text-xs font-semibold text-gray-500">
                          Week total — {wkRecords.length} record{wkRecords.length !== 1 ? 's' : ''}
                        </td>
                        <td className="px-4 py-2 text-xs font-bold text-gray-800 font-mono">
                          {fmtDuration(totalWeekMins)}
                        </td>
                        <td colSpan={4} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
