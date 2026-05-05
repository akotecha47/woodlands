import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── Shared ───────────────────────────────────────────────────────────────────

const todayDate = new Date().toISOString().split('T')[0]

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function lunchMins(lunch_out, lunch_in) {
  if (!lunch_out || !lunch_in) return null
  return Math.round((new Date(lunch_in) - new Date(lunch_out)) / 60000)
}

function Badge({ variant, children }) {
  const cls = {
    green: 'bg-green-100 text-green-700',
    gray:  'bg-gray-100 text-gray-600',
    red:   'bg-red-100 text-red-700',
  }[variant]
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  )
}

const thCls =
  'whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500'
const tdCls = 'px-4 py-3'

// Fetches all staff merged with today's attendance record (or null if absent)
async function fetchAttendanceRows() {
  const [{ data: staff }, { data: records }] = await Promise.all([
    supabase.from('staff').select('*, departments(name)').order('name'),
    supabase.from('attendance').select('*').eq('date', todayDate),
  ])
  return (staff ?? []).map(s => ({
    ...s,
    record: (records ?? []).find(r => r.staff_id === s.id) ?? null,
  }))
}

// ─── Tab 1: Today's Attendance ────────────────────────────────────────────────

function TodaysAttendance() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null) // staff id of in-flight action

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAttendanceRows().then(merged => {
      if (cancelled) return
      setRows(merged)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  async function refresh() {
    setRows(await fetchAttendanceRows())
  }

  async function handleClockIn(staffId) {
    setActionLoading(staffId)
    await supabase.from('attendance').insert({
      staff_id: staffId,
      date:     todayDate,
      clock_in: new Date().toISOString(),
    })
    await refresh()
    setActionLoading(null)
  }

  async function handleClockOut(staffId, recordId) {
    setActionLoading(staffId)
    await supabase
      .from('attendance')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', recordId)
    await refresh()
    setActionLoading(null)
  }

  async function handleLunchOut(staffId, recordId) {
    setActionLoading(staffId)
    await supabase
      .from('attendance')
      .update({ lunch_out: new Date().toISOString() })
      .eq('id', recordId)
    await refresh()
    setActionLoading(null)
  }

  async function handleLunchIn(staffId, recordId) {
    setActionLoading(staffId)
    await supabase
      .from('attendance')
      .update({ lunch_in: new Date().toISOString() })
      .eq('id', recordId)
    await refresh()
    setActionLoading(null)
  }

  function statusBadge(record) {
    if (!record) return <Badge variant="red">Absent</Badge>
    if (!record.clock_out) return <Badge variant="green">On Shift</Badge>
    return <Badge variant="gray">Completed</Badge>
  }

  function actionCell(row) {
    const busy = actionLoading === row.id
    if (!row.record) {
      return (
        <button
          onClick={() => handleClockIn(row.id)}
          disabled={busy}
          className="rounded-md bg-[#16a34a] px-3 py-1 text-xs font-medium text-white hover:bg-[#15803d] disabled:opacity-50 transition-colors"
        >
          {busy ? '…' : 'Clock In'}
        </button>
      )
    }
    if (!row.record.clock_out) {
      const r = row.record
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleClockOut(row.id, r.id)}
            disabled={busy}
            className="rounded-md bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50 transition-colors"
          >
            {busy ? '…' : 'Clock Out'}
          </button>
          {!r.lunch_out && (
            <button
              onClick={() => handleLunchOut(row.id, r.id)}
              disabled={busy}
              className="rounded-md border border-amber-400 px-3 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50 disabled:opacity-50 transition-colors"
            >
              Lunch Out
            </button>
          )}
          {r.lunch_out && !r.lunch_in && (
            <button
              onClick={() => handleLunchIn(row.id, r.id)}
              disabled={busy}
              className="rounded-md border border-blue-400 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors"
            >
              Lunch In
            </button>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {['Name', 'Department', 'Role', 'Clock In', 'Clock Out',
              'Lunch Out', 'Lunch In', 'Lunch Duration', 'Status', ''].map(h => (
              <th key={h} className={thCls}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            <tr>
              <td colSpan={10} className="px-4 py-10 text-center text-gray-400">Loading…</td>
            </tr>
          ) : rows.map(row => {
            const mins = lunchMins(row.record?.lunch_out, row.record?.lunch_in)
            return (
              <tr key={row.id} className="hover:bg-gray-50/60">
                <td className={`${tdCls} font-medium text-gray-900`}>{row.name}</td>
                <td className={`${tdCls} text-gray-600`}>{row.departments?.name ?? '—'}</td>
                <td className={`${tdCls} text-gray-600`}>{row.role}</td>
                <td className={`${tdCls} tabular-nums text-gray-700`}>{fmt(row.record?.clock_in)}</td>
                <td className={`${tdCls} tabular-nums text-gray-700`}>{fmt(row.record?.clock_out)}</td>
                <td className={`${tdCls} tabular-nums text-gray-700`}>{fmt(row.record?.lunch_out)}</td>
                <td className={`${tdCls} tabular-nums text-gray-700`}>{fmt(row.record?.lunch_in)}</td>
                <td className={tdCls}>
                  {mins === null ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <span className={mins > 60 ? 'font-bold text-red-600' : 'text-gray-700'}>
                      {mins} min
                    </span>
                  )}
                </td>
                <td className={tdCls}>{statusBadge(row.record)}</td>
                <td className={tdCls}>{actionCell(row)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tab 2: Staff List ────────────────────────────────────────────────────────

function StaffList() {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('staff')
      .select('*, departments(name)')
      .order('name')
      .then(({ data }) => {
        if (cancelled) return
        setStaff(data ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {['Name', 'Department', 'Role'].map(h => (
              <th key={h} className={thCls}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            <tr>
              <td colSpan={3} className="px-4 py-10 text-center text-gray-400">Loading…</td>
            </tr>
          ) : staff.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-10 text-center text-gray-400">No staff found.</td>
            </tr>
          ) : staff.map(s => (
            <tr key={s.id} className="hover:bg-gray-50/60">
              <td className={`${tdCls} font-medium text-gray-900`}>{s.name}</td>
              <td className={`${tdCls} text-gray-600`}>{s.departments?.name ?? '—'}</td>
              <td className={`${tdCls} text-gray-600`}>{s.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = ["Today's Attendance", 'Staff List']

export default function Attendance() {
  const [tab, setTab] = useState(0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Attendance</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track daily staff attendance and manage your team.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={[
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === i
                ? 'border-[#16a34a] text-[#16a34a]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <TodaysAttendance />}
      {tab === 1 && <StaffList />}
    </div>
  )
}
