import { useEffect, useState, Fragment } from 'react'
import { supabase } from '../lib/supabase'

// ─── Shared ───────────────────────────────────────────────────────────────────

const todayDate = new Date().toISOString().split('T')[0]

function Badge({ variant, children }) {
  const cls = {
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
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

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 ' +
  'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]'

const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

// ─── Tab 1: Room Checks ───────────────────────────────────────────────────────

async function fetchRoomCheckRows() {
  const [{ data: rooms }, { data: checks }] = await Promise.all([
    supabase.from('rooms').select('*').order('room_number'),
    supabase.from('room_checks').select('*').eq('check_date', todayDate),
  ])
  return (rooms ?? []).map(r => ({
    ...r,
    check: (checks ?? []).find(c => c.room_id === r.id) ?? null,
  }))
}

const logDefaults = { checkedBy: '', notes: '', shift: 'Morning' }

function RoomChecks() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [logRoomId, setLogRoomId] = useState(null)  // room being logged
  const [logForm, setLogForm] = useState(logDefaults)
  const [logSubmitting, setLogSubmitting] = useState(false)
  const [approvingId, setApprovingId] = useState(null) // check id being approved
  const [approverName, setApproverName] = useState('')
  const [approveSubmitting, setApproveSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchRoomCheckRows().then(merged => {
      if (cancelled) return
      setRows(merged)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  async function refresh() {
    setRows(await fetchRoomCheckRows())
  }

  async function handleLogCheck(e, roomId) {
    e.preventDefault()
    setLogSubmitting(true)
    await supabase.from('room_checks').insert({
      room_id:    roomId,
      checked_by: logForm.checkedBy,
      notes:      logForm.notes,
      shift:      logForm.shift,
      status:     'pending',
      check_date: todayDate,
    })
    setLogRoomId(null)
    setLogForm(logDefaults)
    setLogSubmitting(false)
    await refresh()
  }

  async function handleApprove(checkId) {
    if (!approverName.trim()) return
    setApproveSubmitting(true)
    await supabase
      .from('room_checks')
      .update({ approved_by: approverName.trim(), status: 'completed' })
      .eq('id', checkId)
    setApprovingId(null)
    setApproverName('')
    setApproveSubmitting(false)
    await refresh()
  }

  function statusBadge(check) {
    if (!check) return <Badge variant="gray">Not Checked</Badge>
    if (check.status === 'completed') return <Badge variant="green">Completed</Badge>
    return <Badge variant="amber">Pending</Badge>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {['Room', 'Type', 'Checked By', 'Approved By', 'Status', 'Notes', 'Action'].map(h => (
              <th key={h} className={thCls}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-gray-400">Loading…</td>
            </tr>
          ) : rows.map(row => (
            <Fragment key={row.id}>
              <tr className="hover:bg-gray-50/60">
                <td className={`${tdCls} font-medium text-gray-900`}>{row.room_number}</td>
                <td className={`${tdCls} text-gray-600`}>{row.room_type}</td>
                <td className={`${tdCls} text-gray-600`}>{row.check?.checked_by ?? '—'}</td>
                <td className={`${tdCls} text-gray-600`}>{row.check?.approved_by ?? '—'}</td>
                <td className={tdCls}>{statusBadge(row.check)}</td>
                <td className={`${tdCls} max-w-[200px] truncate text-gray-600`}>
                  {row.check?.notes || '—'}
                </td>
                <td className={tdCls}>
                  {/* No check today → Log Check button */}
                  {!row.check && logRoomId !== row.id && (
                    <button
                      onClick={() => { setLogRoomId(row.id); setLogForm(logDefaults) }}
                      className="rounded-md bg-[#16a34a] px-3 py-1 text-xs font-medium text-white hover:bg-[#15803d] transition-colors"
                    >
                      Log Check
                    </button>
                  )}

                  {/* Pending check → Approve inline */}
                  {row.check?.status === 'pending' && (
                    approvingId === row.check.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          type="text"
                          value={approverName}
                          onChange={e => setApproverName(e.target.value)}
                          placeholder="Approver name"
                          className="w-28 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#16a34a]"
                        />
                        <button
                          onClick={() => handleApprove(row.check.id)}
                          disabled={approveSubmitting || !approverName.trim()}
                          className="rounded-md bg-[#16a34a] px-2 py-1 text-xs font-medium text-white hover:bg-[#15803d] disabled:opacity-50 transition-colors"
                        >
                          {approveSubmitting ? '…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => { setApprovingId(null); setApproverName('') }}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setApprovingId(row.check.id)}
                        className="rounded-md border border-[#16a34a] px-3 py-1 text-xs font-medium text-[#16a34a] hover:bg-green-50 transition-colors"
                      >
                        Approve
                      </button>
                    )
                  )}
                </td>
              </tr>

              {/* Inline Log Check form row */}
              {logRoomId === row.id && (
                <tr>
                  <td colSpan={7} className="bg-gray-50 px-6 py-4">
                    <form
                      onSubmit={e => handleLogCheck(e, row.id)}
                      className="flex flex-wrap items-end gap-3"
                    >
                      <div>
                        <label className={labelCls}>Checked By</label>
                        <input
                          required
                          autoFocus
                          type="text"
                          value={logForm.checkedBy}
                          onChange={e => setLogForm(f => ({ ...f, checkedBy: e.target.value }))}
                          placeholder="Staff name"
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]"
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Shift</label>
                        <select
                          value={logForm.shift}
                          onChange={e => setLogForm(f => ({ ...f, shift: e.target.value }))}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]"
                        >
                          <option>Morning</option>
                          <option>Evening</option>
                        </select>
                      </div>
                      <div className="min-w-[180px] flex-1">
                        <label className={labelCls}>Notes</label>
                        <input
                          type="text"
                          value={logForm.notes}
                          onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
                          placeholder="Optional notes"
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={logSubmitting}
                          className="rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] disabled:opacity-50 transition-colors"
                        >
                          {logSubmitting ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setLogRoomId(null)}
                          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tab 2: Guest Complaints ──────────────────────────────────────────────────

const complaintDefaults = { roomId: '', complaint: '', shift: 'Morning', date: todayDate }

function GuestComplaints({ rooms }) {
  const [form, setForm] = useState(complaintDefaults)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [list, setList] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [resolving, setResolving] = useState(null)

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  async function fetchList() {
    const { data } = await supabase
      .from('guest_complaints')
      .select('*, rooms(room_number)')
      .order('created_at', { ascending: false })
    return data ?? []
  }

  useEffect(() => {
    let cancelled = false
    fetchList().then(data => {
      if (cancelled) return
      setList(data)
      setListLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  async function refresh() {
    setList(await fetchList())
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(false)
    const { error: err } = await supabase.from('guest_complaints').insert({
      room_id:   form.roomId,
      complaint: form.complaint,
      shift:     form.shift,
      date:      form.date,
      resolved:  false,
    })
    if (err) { setError(err.message); setSubmitting(false); return }
    setSuccess(true)
    setForm(complaintDefaults)
    setSubmitting(false)
    await refresh()
  }

  async function handleResolve(id) {
    setResolving(id)
    await supabase.from('guest_complaints').update({ resolved: true }).eq('id', id)
    await refresh()
    setResolving(null)
  }

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold text-gray-900">Log a Complaint</h2>

          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Complaint logged successfully.
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className={labelCls}>Room</label>
            <select required value={form.roomId} onChange={set('roomId')} className={inputCls}>
              <option value="">Select room…</option>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>Room {r.room_number}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Complaint</label>
            <textarea
              required
              rows={3}
              value={form.complaint}
              onChange={set('complaint')}
              placeholder="Describe the complaint…"
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Shift</label>
              <select value={form.shift} onChange={set('shift')} className={inputCls}>
                <option>Morning</option>
                <option>Evening</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={form.date} onChange={set('date')} className={inputCls} />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#15803d] disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Logging…' : 'Log Complaint'}
          </button>
        </form>
      </div>

      {/* Complaints table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Room', 'Complaint', 'Shift', 'Date', 'Status', ''].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {listLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading…</td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">No complaints logged yet.</td>
              </tr>
            ) : list.map(c => (
              <tr key={c.id} className="hover:bg-gray-50/60">
                <td className={`${tdCls} font-medium text-gray-900`}>
                  Room {c.rooms?.room_number ?? '—'}
                </td>
                <td className={`${tdCls} max-w-[260px] text-gray-600`}>{c.complaint}</td>
                <td className={`${tdCls} text-gray-600`}>{c.shift}</td>
                <td className={`${tdCls} text-gray-600`}>{c.date}</td>
                <td className={tdCls}>
                  <Badge variant={c.resolved ? 'green' : 'red'}>
                    {c.resolved ? 'Resolved' : 'Open'}
                  </Badge>
                </td>
                <td className={tdCls}>
                  {!c.resolved && (
                    <button
                      onClick={() => handleResolve(c.id)}
                      disabled={resolving === c.id}
                      className="rounded-md border border-green-400 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 transition-colors"
                    >
                      {resolving === c.id ? '…' : 'Mark Resolved'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = ['Room Checks', 'Guest Complaints']

export default function Housekeeping() {
  const [tab, setTab] = useState(0)
  const [rooms, setRooms] = useState([])

  useEffect(() => {
    let cancelled = false
    supabase.from('rooms').select('*').order('room_number').then(({ data }) => {
      if (cancelled) return
      setRooms(data ?? [])
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Housekeeping</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage room checks and track guest complaints.
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

      {tab === 0 && <RoomChecks />}
      {tab === 1 && <GuestComplaints rooms={rooms} />}
    </div>
  )
}
