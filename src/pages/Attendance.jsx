import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── constants ──────────────────────────────────────────────────

const TABS = [
  { id: 'today',   label: 'Today'      },
  { id: 'history', label: 'History'    },
  { id: 'staff',   label: 'Staff List' },
]

const GPS_BYPASS_ROLES = new Set([
  'owner', 'manager', 'store_supervisor', 'bar1', 'bar2', 'restaurant_manager',
])
const LODGE_LAT  = -13.9626
const LODGE_LNG  =  33.7741
const GPS_RADIUS =  100  // metres

const DEPARTMENTS = [
  'Kitchen', 'Bar', 'Restaurant', 'Grounds', 'Front Desk',
  'Security', 'Housekeeping', 'Admin',
]

// ── helpers ────────────────────────────────────────────────────

function haversineM(lat1, lng1, lat2, lng2) {
  const R  = 6371000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const a  = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getPosition() {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
  )
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function offsetDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fmtTime(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function lunchMins(rec) {
  if (!rec?.lunch_out || !rec?.lunch_in) return null
  return Math.round((new Date(rec.lunch_in) - new Date(rec.lunch_out)) / 60000)
}

// ── shared UI ──────────────────────────────────────────────────

const fieldCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 disabled:bg-gray-50'

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
function Inp(props)                  { return <input  className={fieldCls} {...props} /> }
function Sel({ children, ...props }) { return <select className={fieldCls} {...props}>{children}</select> }
function Th({ children }) {
  return <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{children}</th>
}
function Td({ children }) {
  return <td className="px-4 py-3 text-sm text-gray-600">{children ?? '—'}</td>
}

const STATUS_CFG = {
  on_time: { label: 'On Time', cls: 'bg-green-100 text-green-700' },
  late:    { label: 'Late',    cls: 'bg-red-100 text-red-700'     },
  absent:  { label: 'Absent',  cls: 'bg-gray-100 text-gray-500'   },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status]
  if (!cfg) return <span className="text-xs text-gray-400">—</span>
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── main component ─────────────────────────────────────────────

export default function Attendance() {
  const { session, profile } = useAuth()
  const isOwnerOrManager = profile?.role === 'owner' || profile?.role === 'manager'

  const [tab, setTab] = useState('today')

  // today
  const [staff,     setStaff]     = useState([])
  const [todayRecs, setTodayRecs] = useState([])
  const [busyId,    setBusyId]    = useState(null)
  const [gpsErrors, setGpsErrors] = useState({})

  // history
  const [histRecs,   setHistRecs]   = useState([])
  const [dateFrom,   setDateFrom]   = useState(offsetDays(-6))
  const [dateTo,     setDateTo]     = useState(todayISO())
  const [deptFilter, setDeptFilter] = useState('')

  // staff list
  const [allStaff,  setAllStaff]  = useState([])
  const [staffForm, setStaffForm] = useState({ full_name: '', department: '', role: '', shift_start: '', shift_end: '' })
  const [staffBusy, setStaffBusy] = useState(false)

  const [toast, setToast] = useState(null)

  function flash(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // ── fetchers ───────────────────────────────────────────────────

  async function fetchToday() {
    const [sRes, rRes] = await Promise.all([
      supabase.from('staff').select('*').eq('is_active', true).order('department').order('full_name'),
      supabase.from('attendance_records').select('*').eq('date', todayISO()),
    ])
    if (sRes.data) setStaff(sRes.data)
    if (rRes.data) setTodayRecs(rRes.data)
  }

  async function fetchHistory() {
    const { data } = await supabase
      .from('attendance_records')
      .select('*, staff(full_name, department)')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (data) {
      setHistRecs(deptFilter ? data.filter(r => r.staff?.department === deptFilter) : data)
    }
  }

  async function fetchAllStaff() {
    const { data } = await supabase.from('staff').select('*').order('department').order('full_name')
    if (data) setAllStaff(data)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchToday() }, [])
  useEffect(() => { if (tab === 'today')   fetchToday()    }, [tab])             // eslint-disable-line
  useEffect(() => { if (tab === 'history') fetchHistory()  }, [tab, dateFrom, dateTo, deptFilter]) // eslint-disable-line
  useEffect(() => { if (tab === 'staff')   fetchAllStaff() }, [tab])             // eslint-disable-line

  // ── GPS check ──────────────────────────────────────────────────

  async function checkGPS(staffMember) {
    if (GPS_BYPASS_ROLES.has(staffMember.role)) return { ok: true }
    try {
      const pos  = await getPosition()
      const dist = haversineM(pos.coords.latitude, pos.coords.longitude, LODGE_LAT, LODGE_LNG)
      if (dist <= GPS_RADIUS) return { ok: true }
      return { ok: false, error: `${Math.round(dist)}m from lodge (max ${GPS_RADIUS}m)` }
    } catch {
      return { ok: false, error: 'GPS unavailable or permission denied' }
    }
  }

  // ── clock actions ──────────────────────────────────────────────

  async function clockIn(staffMember, override = false) {
    setBusyId(staffMember.id)
    setGpsErrors(e => ({ ...e, [staffMember.id]: null }))
    try {
      if (!override) {
        const gps = await checkGPS(staffMember)
        if (!gps.ok) {
          setGpsErrors(e => ({ ...e, [staffMember.id]: gps.error }))
          return
        }
      }

      const now    = new Date()
      let   status = 'on_time'
      if (staffMember.shift_start) {
        const [h, m] = staffMember.shift_start.split(':').map(Number)
        const shift  = new Date(now)
        shift.setHours(h, m, 0, 0)
        if (now > shift) status = 'late'
      }

      const { error } = await supabase.from('attendance_records').insert({
        staff_id:     staffMember.id,
        date:         todayISO(),
        clock_in:     now.toISOString(),
        status,
        gps_verified: !override,
        recorded_by:  session?.user?.id ?? null,
      })
      if (error) throw error
      flash(`${staffMember.full_name} clocked in${override ? ' (override)' : ''}`)
      fetchToday()
    } catch (err) { flash(err.message, false) }
    finally { setBusyId(null) }
  }

  async function clockOut(staffMember, rec) {
    setBusyId(staffMember.id)
    try {
      const { error } = await supabase.from('attendance_records')
        .update({ clock_out: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', rec.id)
      if (error) throw error
      flash(`${staffMember.full_name} clocked out`)
      fetchToday()
    } catch (err) { flash(err.message, false) }
    finally { setBusyId(null) }
  }

  async function lunchOut(staffMember, rec) {
    setBusyId(staffMember.id)
    try {
      const { error } = await supabase.from('attendance_records')
        .update({ lunch_out: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', rec.id)
      if (error) throw error
      flash(`${staffMember.full_name} on lunch`)
      fetchToday()
    } catch (err) { flash(err.message, false) }
    finally { setBusyId(null) }
  }

  async function lunchIn(staffMember, rec) {
    setBusyId(staffMember.id)
    try {
      const { error } = await supabase.from('attendance_records')
        .update({ lunch_in: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', rec.id)
      if (error) throw error
      flash(`${staffMember.full_name} back from lunch`)
      fetchToday()
    } catch (err) { flash(err.message, false) }
    finally { setBusyId(null) }
  }

  // ── add staff ──────────────────────────────────────────────────

  async function handleAddStaff(e) {
    e.preventDefault()
    setStaffBusy(true)
    try {
      const { error } = await supabase.from('staff').insert({
        full_name:   staffForm.full_name,
        department:  staffForm.department  || null,
        role:        staffForm.role        || null,
        shift_start: staffForm.shift_start || null,
        shift_end:   staffForm.shift_end   || null,
      })
      if (error) throw error
      flash('Staff member added')
      setStaffForm({ full_name: '', department: '', role: '', shift_start: '', shift_end: '' })
      fetchAllStaff()
    } catch (err) { flash(err.message, false) }
    finally { setStaffBusy(false) }
  }

  // ── Today tab ──────────────────────────────────────────────────

  const recByStaff = Object.fromEntries(todayRecs.map(r => [r.staff_id, r]))

  const byDept = staff.reduce((acc, s) => {
    const d = s.department ?? 'Other'
    if (!acc[d]) acc[d] = []
    acc[d].push(s)
    return acc
  }, {})

  // ── render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-gray-900">Attendance</h1>

      {toast && (
        <div className={`fixed top-4 right-4 z-40 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">

        {/* ── Today ───────────────────────────────────────── */}
        {tab === 'today' && (
          <div className="p-6 space-y-6">
            <h2 className="text-base font-semibold text-gray-800">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </h2>

            {staff.length === 0 && (
              <p className="text-sm text-gray-400 py-8 text-center">
                No active staff. Add staff in the Staff List tab.
              </p>
            )}

            {Object.entries(byDept).map(([dept, members]) => (
              <div key={dept}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{dept}</p>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <Th>Name</Th>
                        <Th>Shift</Th>
                        <Th>Status</Th>
                        <Th>Clock In</Th>
                        <Th>Lunch</Th>
                        <Th>Clock Out</Th>
                        <Th>GPS</Th>
                        <Th>Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(s => {
                        const rec  = recByStaff[s.id]
                        const busy = busyId === s.id
                        const err  = gpsErrors[s.id]
                        const mins = lunchMins(rec)

                        // phase determines which buttons to show
                        const onLunch = rec?.clock_in && !rec?.clock_out && rec?.lunch_out && !rec?.lunch_in
                        const working = rec?.clock_in && !rec?.clock_out && !onLunch
                        const done    = !!rec?.clock_out
                        const pre     = !rec?.clock_in

                        const shiftLabel = s.shift_start
                          ? `${s.shift_start.slice(0,5)}${s.shift_end ? '–' + s.shift_end.slice(0,5) : ''}`
                          : '—'

                        return (
                          <Fragment key={s.id}>
                            <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.full_name}</td>
                              <Td>{shiftLabel}</Td>
                              <td className="px-4 py-3"><StatusBadge status={rec?.status} /></td>
                              <Td>{fmtTime(rec?.clock_in)}</Td>
                              <td className="px-4 py-3 text-sm">
                                {onLunch ? (
                                  <span className="text-amber-600 text-xs font-medium">On lunch…</span>
                                ) : mins !== null ? (
                                  <span className={mins > 60 ? 'text-amber-600 font-medium' : 'text-gray-600'}>
                                    {mins}m{mins > 60 ? ' ⚠' : ''}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <Td>{fmtTime(rec?.clock_out)}</Td>
                              <td className="px-4 py-3 text-xs font-medium">
                                {rec ? (
                                  <span className={rec.gps_verified ? 'text-green-600' : 'text-gray-400'}>
                                    {rec.gps_verified ? '✓ Yes' : '– No'}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-1.5 flex-wrap">
                                  {pre && (
                                    <button onClick={() => clockIn(s)} disabled={busy}
                                      className="px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-60 transition-colors">
                                      {busy ? '…' : 'Clock In'}
                                    </button>
                                  )}
                                  {working && !rec?.lunch_out && (
                                    <button onClick={() => lunchOut(s, rec)} disabled={busy}
                                      className="px-3 py-1 text-xs font-medium bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg disabled:opacity-60 transition-colors">
                                      {busy ? '…' : 'Lunch Out'}
                                    </button>
                                  )}
                                  {onLunch && (
                                    <button onClick={() => lunchIn(s, rec)} disabled={busy}
                                      className="px-3 py-1 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg disabled:opacity-60 transition-colors">
                                      {busy ? '…' : 'Lunch In'}
                                    </button>
                                  )}
                                  {working && (
                                    <button onClick={() => clockOut(s, rec)} disabled={busy}
                                      className="px-3 py-1 text-xs font-medium bg-gray-700 hover:bg-gray-800 text-white rounded-lg disabled:opacity-60 transition-colors">
                                      {busy ? '…' : 'Clock Out'}
                                    </button>
                                  )}
                                  {done && (
                                    <span className="text-xs text-gray-400 italic">Done</span>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* GPS error row */}
                            {err && (
                              <tr className="border-b border-gray-100 last:border-0">
                                <td colSpan={8} className="px-4 pb-3 pt-0">
                                  <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                                    <span>GPS check failed: {err}</span>
                                    {isOwnerOrManager && (
                                      <button onClick={() => clockIn(s, true)} disabled={busy}
                                        className="ml-auto shrink-0 px-2.5 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-60 transition-colors">
                                        Override &amp; Clock In
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── History ─────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-base font-semibold text-gray-800 mr-auto">Attendance History</h2>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
              </div>
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
                <option value="">All departments</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <Th>Name</Th><Th>Department</Th><Th>Date</Th>
                    <Th>Clock In</Th><Th>Clock Out</Th><Th>Lunch</Th>
                    <Th>Status</Th><Th>GPS</Th>
                  </tr>
                </thead>
                <tbody>
                  {histRecs.map(r => {
                    const mins = lunchMins(r)
                    return (
                      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.staff?.full_name ?? '—'}</td>
                        <Td>{r.staff?.department}</Td>
                        <Td>{fmtDate(r.date)}</Td>
                        <Td>{fmtTime(r.clock_in)}</Td>
                        <Td>{fmtTime(r.clock_out)}</Td>
                        <td className="px-4 py-3 text-sm">
                          {mins !== null ? (
                            <span className={mins > 60 ? 'text-amber-600 font-medium' : 'text-gray-600'}>
                              {mins}m{mins > 60 ? ' ⚠' : ''}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                        <td className="px-4 py-3 text-xs font-medium">
                          <span className={r.gps_verified ? 'text-green-600' : 'text-gray-400'}>
                            {r.gps_verified ? '✓ Yes' : '– No'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {histRecs.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">No records found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Staff List ───────────────────────────────────── */}
        {tab === 'staff' && (
          <div className="p-6 space-y-6">
            {isOwnerOrManager && (
              <div>
                <h2 className="text-base font-semibold text-gray-800 mb-4">Add Staff Member</h2>
                <form onSubmit={handleAddStaff} className="grid grid-cols-2 gap-4 max-w-2xl">
                  <Field label="Full Name *">
                    <Inp required value={staffForm.full_name}
                      onChange={e => setStaffForm(f => ({ ...f, full_name: e.target.value }))}
                      placeholder="Full name" />
                  </Field>
                  <Field label="Department">
                    <Sel value={staffForm.department}
                      onChange={e => setStaffForm(f => ({ ...f, department: e.target.value }))}>
                      <option value="">Select department…</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </Sel>
                  </Field>
                  <Field label="Role / Job Title">
                    <Inp value={staffForm.role}
                      onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}
                      placeholder="e.g. Chef, Waiter, Security" />
                  </Field>
                  <div />
                  <Field label="Shift Start">
                    <Inp type="time" value={staffForm.shift_start}
                      onChange={e => setStaffForm(f => ({ ...f, shift_start: e.target.value }))} />
                  </Field>
                  <Field label="Shift End">
                    <Inp type="time" value={staffForm.shift_end}
                      onChange={e => setStaffForm(f => ({ ...f, shift_end: e.target.value }))} />
                  </Field>
                  <div className="col-span-2">
                    <button type="submit" disabled={staffBusy}
                      className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
                      {staffBusy ? 'Adding…' : 'Add Staff Member'}
                    </button>
                  </div>
                </form>
                <div className="border-t border-gray-200 mt-6" />
              </div>
            )}

            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-3">All Staff</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <Th>Name</Th><Th>Department</Th><Th>Role</Th>
                      <Th>Shift Start</Th><Th>Shift End</Th><Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {allStaff.map(s => (
                      <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.full_name}</td>
                        <Td>{s.department}</Td>
                        <Td>{s.role}</Td>
                        <Td>{s.shift_start?.slice(0,5)}</Td>
                        <Td>{s.shift_end?.slice(0,5)}</Td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${s.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {allStaff.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No staff records yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
