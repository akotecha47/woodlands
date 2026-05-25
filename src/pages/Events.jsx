import { useState, useEffect, Fragment } from 'react'
import { ChevronLeft, ChevronRight, X, Pencil, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── constants ──────────────────────────────────────────────────

const TABS = [
  { id: 'upcoming',  label: 'Upcoming'      },
  { id: 'add',       label: 'Add Event'     },
  { id: 'detail',    label: 'Event Detail'  },
  { id: 'calendar',  label: 'Calendar'      },
  { id: 'all',       label: 'All Events'    },
]

const EVENT_TYPES    = ['wedding', 'corporate', 'birthday', 'private', 'other']
const VENUES         = ['Main Hall', 'Garden', 'Sports Bar', 'Restaurant']
const PAY_METHODS    = ['cash', 'bank transfer', 'Mpamba', 'Airtel Money']
const EVENT_STATUSES = ['enquiry', 'confirmed', 'in_progress', 'completed', 'cancelled']
const DEPT_ORDER     = ['Kitchen', 'Bar', 'Grounds', 'Front Desk']
const CAL_DAYS       = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const DEFAULT_TASKS = {
  Kitchen: [
    'Menu agreed', 'Prep start time confirmed',
    'Dietary requirements noted', 'Kitchen staff assigned',
  ],
  Bar: [
    'Drinks package confirmed', 'Stock pulled',
    'Bar location confirmed', 'Barman assigned',
  ],
  Grounds: [
    'Venue setup complete', 'Table layout done', 'Chairs arranged',
    'AV setup', 'Decorations done',
  ],
  'Front Desk': [
    'Guest arrival time confirmed', 'Parking arranged',
    'Point of contact assigned',
  ],
}

const STATUS_CFG = {
  enquiry:    { label: 'Enquiry',     badge: 'bg-gray-100 text-gray-600',   cal: 'bg-gray-100 text-gray-700 border-gray-200'   },
  confirmed:  { label: 'Confirmed',   badge: 'bg-blue-100 text-blue-700',   cal: 'bg-blue-100 text-blue-800 border-blue-200'   },
  in_progress:{ label: 'In Progress', badge: 'bg-amber-100 text-amber-700', cal: 'bg-amber-100 text-amber-800 border-amber-200' },
  completed:  { label: 'Completed',   badge: 'bg-green-100 text-green-700', cal: 'bg-green-100 text-green-800 border-green-200' },
  cancelled:  { label: 'Cancelled',   badge: 'bg-red-100 text-red-700',     cal: 'bg-red-50 text-red-600 border-red-200'        },
}

const PAY_CFG = {
  unpaid:           { label: 'Unpaid',           badge: 'bg-red-100 text-red-700'     },
  deposit_received: { label: 'Deposit Received', badge: 'bg-amber-100 text-amber-700' },
  paid_in_full:     { label: 'Paid in Full',      badge: 'bg-green-100 text-green-700' },
}

// ── helpers ────────────────────────────────────────────────────

function toDateStr(d) {
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')
}
const todayStr = () => toDateStr(new Date())

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtTime(ts) {
  if (!ts) return null
  const t = new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return t === '00:00' ? null : t
}

function fmtMWK(n) {
  return `MWK ${Number(n).toLocaleString('en-US')}`
}

function payStatus(totalAmount, payments) {
  const paid  = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  const total = Number(totalAmount ?? 0)
  if (total > 0 && paid >= total) return 'paid_in_full'
  if (paid > 0) return 'deposit_received'
  return 'unpaid'
}

function buildCalGrid(year, month) {
  const firstDay  = new Date(year, month, 1)
  const lastDate  = new Date(year, month + 1, 0).getDate()
  const startOff  = (firstDay.getDay() + 6) % 7   // Mon = 0
  const cells = [...Array(startOff).fill(null)]
  for (let d = 1; d <= lastDate; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
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
function Td({ children, bold = false }) {
  return <td className={`px-4 py-3 text-sm ${bold ? 'font-medium text-gray-900' : 'text-gray-600'}`}>{children ?? '—'}</td>
}
function EmptyRow({ cols, msg = 'No events found' }) {
  return <tr><td colSpan={cols} className="px-4 py-8 text-center text-sm text-gray-400">{msg}</td></tr>
}

function EventBadge({ status }) {
  const cfg = STATUS_CFG[status]
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg?.badge ?? 'bg-gray-100 text-gray-600'}`}>
      {cfg?.label ?? status}
    </span>
  )
}
function PayBadge({ status }) {
  const cfg = PAY_CFG[status]
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg?.badge ?? 'bg-gray-100 text-gray-600'}`}>
      {cfg?.label ?? status}
    </span>
  )
}
function SaveBtn({ busy, label, busyLabel = 'Saving…' }) {
  return (
    <button type="submit" disabled={busy}
      className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
      {busy ? busyLabel : label}
    </button>
  )
}

// ── complete-task modal ────────────────────────────────────────

function CompleteTaskModal({ task, onConfirm, onCancel }) {
  const [name, setName] = useState('')
  if (!task) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Mark Task Complete</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 ml-2"><X size={18} /></button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          "<span className="font-medium text-gray-800">{task.title}</span>"
        </p>
        <Field label="Completed by (optional)">
          <Inp
            autoFocus
            placeholder="Name…"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onConfirm(name)}
          />
        </Field>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={() => onConfirm(name)}
            className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg">
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ── events table (shared by Upcoming + All Events) ─────────────

function EventsTable({ events, onOpen, emptyMsg }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <Th>Title</Th><Th>Client</Th><Th>Date</Th><Th>Venue</Th>
            <Th>Guests</Th><Th>Payment</Th><Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {events.map(ev => (
            <tr key={ev.id}
              onClick={() => onOpen(ev.id)}
              className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
              <Td bold>{ev.title}</Td>
              <Td>{ev.organizer_name}</Td>
              <Td>{fmtDate(ev.event_date)}</Td>
              <Td>{ev.venue}</Td>
              <Td>{ev.capacity}</Td>
              <td className="px-4 py-3">
                <PayBadge status={payStatus(ev.total_amount, ev.event_payments)} />
              </td>
              <td className="px-4 py-3"><EventBadge status={ev.status} /></td>
            </tr>
          ))}
          {events.length === 0 && <EmptyRow cols={7} msg={emptyMsg} />}
        </tbody>
      </table>
    </div>
  )
}

// ── inline editable field ──────────────────────────────────────

function InlineEdit({ label, value, display, type = 'text', onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')

  function start() { setDraft(value ?? ''); setEditing(true) }
  async function save() { await onSave(draft); setEditing(false) }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 w-36"
        />
        <button onClick={save}    className="text-green-600 hover:text-green-700"><Check size={14} /></button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
      </div>
    )
  }
  return (
    <button onClick={start} className="group flex items-center gap-1.5 text-sm text-gray-900 hover:text-green-700">
      <span className="font-medium">{display ?? (value || '—')}</span>
      <Pencil size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}

// ── blank form values ──────────────────────────────────────────

const BLANK_FORM = {
  title: '', organizer_name: '', organizer_contact: '',
  event_type: 'wedding', date: todayStr(), start_time: '', end_time: '',
  venue: 'Main Hall', capacity: '', tables_required: '',
  status: 'enquiry', description: '',
}

// ── main component ─────────────────────────────────────────────

export default function Events() {
  const { session } = useAuth()

  const [tab,             setTab]             = useState('upcoming')
  const [prevTab,         setPrevTab]         = useState('upcoming')
  const [selectedId,      setSelectedId]      = useState(null)

  // lists
  const [upcoming,   setUpcoming]   = useState([])
  const [allEvents,  setAllEvents]  = useState([])
  const [calEvents,  setCalEvents]  = useState([])

  // event detail
  const [detailEvent,    setDetailEvent]    = useState(null)
  const [detailPayments, setDetailPayments] = useState([])
  const [detailTasks,    setDetailTasks]    = useState([])

  // calendar
  const [calYear,  setCalYear]  = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())

  // filters
  const [dateFilter,   setDateFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // forms
  const [form,     setForm]     = useState(BLANK_FORM)
  const [depForm,  setDepForm]  = useState({ amount: '', date: todayStr(), method: 'cash' })
  const [balForm,  setBalForm]  = useState({ amount: '', date: todayStr(), method: 'cash' })

  // task completion modal
  const [completingTask, setCompletingTask] = useState(null)

  // ui
  const [formBusy, setFormBusy] = useState(false)
  const [payBusy,  setPayBusy]  = useState(false)
  const [toast,    setToast]    = useState(null)

  function flash(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // ── fetchers ───────────────────────────────────────────────────

  async function fetchUpcoming() {
    const { data } = await supabase
      .from('events').select('*, event_payments(amount)')
      .gte('event_date', new Date().toISOString())
      .neq('status', 'cancelled')
      .order('event_date')
    if (data) setUpcoming(data)
  }

  async function fetchAll() {
    const { data } = await supabase
      .from('events').select('*, event_payments(amount)')
      .order('event_date', { ascending: false })
    if (data) setAllEvents(data)
  }

  async function fetchCalendar(year, month) {
    const start = new Date(year, month, 1)
    const end   = new Date(year, month + 1, 0, 23, 59, 59)
    const { data } = await supabase
      .from('events').select('*')
      .gte('event_date', start.toISOString())
      .lte('event_date', end.toISOString())
      .order('event_date')
    if (data) setCalEvents(data)
  }

  async function fetchDetail(id) {
    const [evtR, payR, taskR] = await Promise.all([
      supabase.from('events').select('*').eq('id', id).single(),
      supabase.from('event_payments').select('*').eq('event_id', id).order('created_at'),
      supabase.from('event_tasks').select('*').eq('event_id', id).order('department').order('created_at'),
    ])
    if (evtR.data)  setDetailEvent(evtR.data)
    if (payR.data)  setDetailPayments(payR.data)
    if (taskR.data) setDetailTasks(taskR.data)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchUpcoming() }, [])

  useEffect(() => {
    if (tab === 'upcoming') fetchUpcoming()
    if (tab === 'all')      fetchAll()
    if (tab === 'calendar') fetchCalendar(calYear, calMonth)
    if (tab === 'detail' && selectedId) fetchDetail(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'calendar') fetchCalendar(calYear, calMonth) }, [calYear, calMonth])

  // ── navigation ─────────────────────────────────────────────────

  function openEvent(id) {
    setPrevTab(tab)
    setSelectedId(id)
    setTab('detail')
  }

  // ── add event ──────────────────────────────────────────────────

  async function handleAddEvent(e) {
    e.preventDefault(); setFormBusy(true)
    try {
      const eventDate = new Date(`${form.date}T${form.start_time || '00:00'}:00`).toISOString()
      const endDate   = form.end_time ? new Date(`${form.date}T${form.end_time}:00`).toISOString() : null

      const { data: newEvt, error } = await supabase.from('events')
        .insert({
          title:             form.title,
          organizer_name:    form.organizer_name,
          organizer_contact: form.organizer_contact  || null,
          event_type:        form.event_type          || null,
          event_date:        eventDate,
          end_date:          endDate,
          venue:             form.venue               || null,
          capacity:          form.capacity            ? Number(form.capacity)           : null,
          tables_required:   form.tables_required     ? Number(form.tables_required)    : null,
          status:            form.status,
          description:       form.description         || null,
          created_by:        session?.user?.id        ?? null,
        })
        .select('id').single()
      if (error) throw error

      // Auto-create department tasks when status = confirmed
      if (form.status === 'confirmed') {
        const tasks = Object.entries(DEFAULT_TASKS).flatMap(([dept, titles]) =>
          titles.map(title => ({ event_id: newEvt.id, title, department: dept, status: 'pending' }))
        )
        await supabase.from('event_tasks').insert(tasks)
      }

      flash('Event created')
      setForm(BLANK_FORM)
      fetchUpcoming()
    } catch (err) { flash(err.message, false) }
    finally { setFormBusy(false) }
  }

  // ── payments ───────────────────────────────────────────────────

  async function logPayment(type, amount, date, method) {
    setPayBusy(true)
    try {
      const { error } = await supabase.from('event_payments').insert({
        event_id:       selectedId,
        amount:         Number(amount),
        payment_date:   new Date(`${date}T12:00:00`).toISOString(),
        payment_method: method   || null,
        payment_type:   type,
        recorded_by:    session?.user?.id ?? null,
      })
      if (error) throw error
      flash(`${type === 'deposit' ? 'Deposit' : 'Balance'} payment recorded`)
      if (type === 'deposit') setDepForm({ amount: '', date: todayStr(), method: 'cash' })
      else                    setBalForm({ amount: '', date: todayStr(), method: 'cash' })
      fetchDetail(selectedId)
    } catch (err) { flash(err.message, false) }
    finally { setPayBusy(false) }
  }

  async function saveEventField(field, value) {
    await supabase.from('events')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', selectedId)
    setDetailEvent(e => ({ ...e, [field]: value }))
  }

  // ── tasks ──────────────────────────────────────────────────────

  function openCompleteModal(task) {
    setCompletingTask(task)
  }

  async function confirmComplete(name) {
    const task = completingTask
    setCompletingTask(null)
    try {
      const { error } = await supabase.from('event_tasks').update({
        status:       'completed',
        completed_at: new Date().toISOString(),
        completed_by: name || null,
        updated_at:   new Date().toISOString(),
      }).eq('id', task.id)
      if (error) throw error
      fetchDetail(selectedId)
    } catch (err) { flash(err.message, false) }
  }

  async function uncompleteTask(task) {
    try {
      await supabase.from('event_tasks').update({
        status:       'pending',
        completed_at: null,
        completed_by: null,
        updated_at:   new Date().toISOString(),
      }).eq('id', task.id)
      fetchDetail(selectedId)
    } catch (err) { flash(err.message, false) }
  }

  // ── calendar helpers ───────────────────────────────────────────

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  // ── derived ────────────────────────────────────────────────────

  const todayDate    = new Date()
  const calGrid      = buildCalGrid(calYear, calMonth)
  const calMonthName = new Date(calYear, calMonth).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const tasksByDept  = DEPT_ORDER.reduce((acc, d) => ({ ...acc, [d]: [] }), {})
  for (const t of detailTasks) {
    const d = t.department ?? 'Other'
    if (!tasksByDept[d]) tasksByDept[d] = []
    tasksByDept[d].push(t)
  }

  const totalPaid    = detailPayments.reduce((s, p) => s + Number(p.amount), 0)
  const totalAmount  = Number(detailEvent?.total_amount ?? 0)
  const outstanding  = Math.max(0, totalAmount - totalPaid)
  const detailPaySt  = payStatus(totalAmount, detailPayments)

  const filteredAll  = allEvents.filter(ev => {
    const dateOk   = !dateFilter   || toDateStr(new Date(ev.event_date)) === dateFilter
    const statusOk = !statusFilter || ev.status === statusFilter
    return dateOk && statusOk
  })

  // ── render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-gray-900">Events</h1>

      {toast && (
        <div className={`fixed top-4 right-4 z-40 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <CompleteTaskModal
        task={completingTask}
        onConfirm={confirmComplete}
        onCancel={() => setCompletingTask(null)}
      />

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto bg-gray-100 p-1 rounded-xl w-fit max-w-full">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.id === 'detail' && selectedId && detailEvent ? detailEvent.title : t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">

        {/* ── Upcoming ──────────────────────────────────── */}
        {tab === 'upcoming' && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Upcoming Events</h2>
            <EventsTable events={upcoming} onOpen={openEvent} emptyMsg="No upcoming events" />
          </div>
        )}

        {/* ── Add Event ─────────────────────────────────── */}
        {tab === 'add' && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-5">Add Event</h2>
            <form onSubmit={handleAddEvent} className="space-y-4 max-w-2xl">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Title *">
                  <Inp required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Event title" />
                </Field>
                <Field label="Event Type">
                  <Sel value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}>
                    {EVENT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </Sel>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Client Name *">
                  <Inp required value={form.organizer_name} onChange={e => setForm(f => ({ ...f, organizer_name: e.target.value }))} placeholder="Full name" />
                </Field>
                <Field label="Client Phone">
                  <Inp type="tel" value={form.organizer_contact} onChange={e => setForm(f => ({ ...f, organizer_contact: e.target.value }))} />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Field label="Date *">
                  <Inp type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </Field>
                <Field label="Start Time">
                  <Inp type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                </Field>
                <Field label="End Time">
                  <Inp type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Field label="Venue">
                  <Sel value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}>
                    {VENUES.map(v => <option key={v} value={v}>{v}</option>)}
                  </Sel>
                </Field>
                <Field label="Guest Count">
                  <Inp type="number" min="0" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
                </Field>
                <Field label="Tables Required">
                  <Inp type="number" min="0" value={form.tables_required} onChange={e => setForm(f => ({ ...f, tables_required: e.target.value }))} />
                </Field>
              </div>

              <Field label="Status">
                <Sel value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {EVENT_STATUSES.map(s => (
                    <option key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</option>
                  ))}
                </Sel>
              </Field>

              <Field label="Notes">
                <textarea rows={3} className={fieldCls} value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Any additional notes…" />
              </Field>

              {form.status === 'confirmed' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs text-blue-700">
                  Confirming will auto-create department checklists for Kitchen, Bar, Grounds and Front Desk.
                </div>
              )}

              <SaveBtn busy={formBusy} label="Create Event" />
            </form>
          </div>
        )}

        {/* ── Event Detail ──────────────────────────────── */}
        {tab === 'detail' && (
          <div className="p-6">
            {!selectedId ? (
              <p className="text-sm text-gray-400 py-8 text-center">Select an event from Upcoming, All Events or Calendar to view its details.</p>
            ) : !detailEvent ? (
              <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
            ) : (
              <div className="space-y-8">
                {/* Back + header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <button onClick={() => setTab(prevTab)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-2">
                      <ChevronLeft size={14} /> Back
                    </button>
                    <h2 className="text-xl font-semibold text-gray-900">{detailEvent.title}</h2>
                    <div className="flex items-center gap-2 mt-1.5">
                      <EventBadge status={detailEvent.status} />
                      <PayBadge status={detailPaySt} />
                    </div>
                  </div>
                </div>

                {/* Event info grid */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 bg-gray-50 rounded-xl p-5 text-sm">
                  {[
                    ['Client',        detailEvent.organizer_name],
                    ['Phone',         detailEvent.organizer_contact],
                    ['Type',          detailEvent.event_type ? detailEvent.event_type.charAt(0).toUpperCase() + detailEvent.event_type.slice(1) : null],
                    ['Venue',         detailEvent.venue],
                    ['Date',          fmtDate(detailEvent.event_date)],
                    ['Time',          [fmtTime(detailEvent.event_date), fmtTime(detailEvent.end_date)].filter(Boolean).join(' – ') || null],
                    ['Guests',        detailEvent.capacity],
                    ['Tables',        detailEvent.tables_required],
                  ].map(([label, val]) => val ? (
                    <div key={label} className="flex gap-2">
                      <span className="text-gray-500 w-20 shrink-0">{label}</span>
                      <span className="text-gray-900 font-medium">{val}</span>
                    </div>
                  ) : null)}
                  {detailEvent.description && (
                    <div className="col-span-2 flex gap-2">
                      <span className="text-gray-500 w-20 shrink-0">Notes</span>
                      <span className="text-gray-900">{detailEvent.description}</span>
                    </div>
                  )}
                </div>

                {/* ── Payment Tracker ───────────────────── */}
                <div>
                  <h3 className="text-base font-semibold text-gray-800 mb-4">Payment Tracker</h3>

                  {/* Totals row */}
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">Total Amount</p>
                      <InlineEdit
                        label="Total Amount"
                        value={String(detailEvent.total_amount ?? 0)}
                        display={fmtMWK(detailEvent.total_amount ?? 0)}
                        type="number"
                        onSave={v => saveEventField('total_amount', Number(v))}
                      />
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">Paid</p>
                      <p className="text-sm font-semibold text-gray-900">{fmtMWK(totalPaid)}</p>
                    </div>
                    <div className={`rounded-xl p-4 ${outstanding > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                      <p className="text-xs text-gray-500 mb-1">Outstanding</p>
                      <p className={`text-sm font-semibold ${outstanding > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {fmtMWK(outstanding)}
                      </p>
                    </div>
                  </div>

                  {/* Balance due date */}
                  <div className="flex items-center gap-2 mb-5 text-sm">
                    <span className="text-gray-500">Balance due:</span>
                    <InlineEdit
                      value={detailEvent.balance_due_date ?? ''}
                      display={detailEvent.balance_due_date ? fmtDate(detailEvent.balance_due_date) : 'Not set'}
                      type="date"
                      onSave={v => saveEventField('balance_due_date', v || null)}
                    />
                  </div>

                  {/* Payments recorded */}
                  {detailPayments.length > 0 && (
                    <div className="mb-5 overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <Th>Type</Th><Th>Amount</Th><Th>Date</Th><Th>Method</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailPayments.map(p => (
                            <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-700 capitalize">{p.payment_type ?? '—'}</td>
                              <td className="px-4 py-3 text-sm font-semibold text-gray-900">{fmtMWK(p.amount)}</td>
                              <Td>{fmtDate(p.payment_date)}</Td>
                              <td className="px-4 py-3 text-sm text-gray-600 capitalize">{p.payment_method ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Log Deposit + Balance forms side by side */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Deposit */}
                    <div className="border border-gray-200 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Log Deposit</h4>
                      <form onSubmit={e => { e.preventDefault(); logPayment('deposit', depForm.amount, depForm.date, depForm.method) }}
                        className="space-y-3">
                        <Field label="Amount (MWK)">
                          <Inp type="number" required min="0" value={depForm.amount}
                            onChange={e => setDepForm(f => ({ ...f, amount: e.target.value }))} />
                        </Field>
                        <Field label="Date">
                          <Inp type="date" required value={depForm.date}
                            onChange={e => setDepForm(f => ({ ...f, date: e.target.value }))} />
                        </Field>
                        <Field label="Method">
                          <Sel value={depForm.method} onChange={e => setDepForm(f => ({ ...f, method: e.target.value }))}>
                            {PAY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                          </Sel>
                        </Field>
                        <button type="submit" disabled={payBusy}
                          className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-60">
                          {payBusy ? 'Saving…' : 'Record Deposit'}
                        </button>
                      </form>
                    </div>

                    {/* Balance */}
                    <div className="border border-gray-200 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Log Balance Payment</h4>
                      <form onSubmit={e => { e.preventDefault(); logPayment('balance', balForm.amount, balForm.date, balForm.method) }}
                        className="space-y-3">
                        <Field label="Amount (MWK)">
                          <Inp type="number" required min="0" value={balForm.amount}
                            onChange={e => setBalForm(f => ({ ...f, amount: e.target.value }))} />
                        </Field>
                        <Field label="Paid Date">
                          <Inp type="date" required value={balForm.date}
                            onChange={e => setBalForm(f => ({ ...f, date: e.target.value }))} />
                        </Field>
                        <Field label="Method">
                          <Sel value={balForm.method} onChange={e => setBalForm(f => ({ ...f, method: e.target.value }))}>
                            {PAY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                          </Sel>
                        </Field>
                        <button type="submit" disabled={payBusy}
                          className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-60">
                          {payBusy ? 'Saving…' : 'Record Balance'}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>

                {/* ── Department Checklists ─────────────── */}
                {detailTasks.length > 0 && (
                  <div>
                    <h3 className="text-base font-semibold text-gray-800 mb-4">Department Checklists</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {DEPT_ORDER.filter(d => tasksByDept[d]?.length > 0).map(dept => {
                        const tasks     = tasksByDept[dept]
                        const doneCount = tasks.filter(t => t.status === 'completed').length
                        return (
                          <div key={dept} className="border border-gray-200 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-semibold text-gray-800">{dept}</h4>
                              <span className="text-xs text-gray-500">{doneCount}/{tasks.length}</span>
                            </div>
                            <div className="space-y-2">
                              {tasks.map(task => (
                                <div key={task.id} className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    checked={task.status === 'completed'}
                                    onChange={e => e.target.checked ? openCompleteModal(task) : uncompleteTask(task)}
                                    className="mt-0.5 rounded border-gray-300 text-green-600 focus:ring-green-600 cursor-pointer"
                                  />
                                  <div className="min-w-0">
                                    <span className={`text-sm ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                      {task.title}
                                    </span>
                                    {task.completed_by && (
                                      <p className="text-xs text-gray-400 mt-0.5">by {task.completed_by}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Calendar ──────────────────────────────────── */}
        {tab === 'calendar' && (
          <div className="p-6">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-5">
              <button onClick={prevMonth}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-gray-800">{calMonthName}</span>
              <button onClick={nextMonth}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden border border-gray-200">
              {/* Day headers */}
              {CAL_DAYS.map(d => (
                <div key={d} className="bg-gray-50 text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {d}
                </div>
              ))}

              {/* Day cells */}
              {calGrid.flat().map((day, idx) => {
                const isToday = day && new Date(calYear, calMonth, day).toDateString() === todayDate.toDateString()
                const dayEvts = day ? calEvents.filter(ev => {
                  const d = new Date(ev.event_date)
                  return d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === day
                }) : []
                return (
                  <div key={idx}
                    className={`bg-white min-h-24 p-2 ${!day ? 'bg-gray-50' : ''}`}>
                    {day && (
                      <>
                        <p className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                          isToday ? 'bg-green-600 text-white' : 'text-gray-600'
                        }`}>
                          {day}
                        </p>
                        {dayEvts.slice(0, 3).map(ev => (
                          <button
                            key={ev.id}
                            onClick={() => openEvent(ev.id)}
                            className={`w-full text-left text-xs px-1.5 py-0.5 rounded border mb-0.5 truncate font-medium transition-opacity hover:opacity-80 ${STATUS_CFG[ev.status]?.cal ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}
                          >
                            {ev.title}
                          </button>
                        ))}
                        {dayEvts.length > 3 && (
                          <p className="text-xs text-gray-400 pl-1">+{dayEvts.length - 3} more</p>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-4 flex-wrap">
              {Object.entries(STATUS_CFG).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={`inline-block w-3 h-3 rounded-sm border ${cfg.cal}`} />
                  <span className="text-xs text-gray-500">{cfg.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── All Events ────────────────────────────────── */}
        {tab === 'all' && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h2 className="text-base font-semibold text-gray-800 mr-auto">All Events</h2>
              <input type="date" value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
              <select value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
                <option value="">All statuses</option>
                {EVENT_STATUSES.map(s => (
                  <option key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</option>
                ))}
              </select>
              {(dateFilter || statusFilter) && (
                <button onClick={() => { setDateFilter(''); setStatusFilter('') }}
                  className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 transition-colors">
                  Clear
                </button>
              )}
            </div>
            <EventsTable
              events={filteredAll}
              onOpen={openEvent}
              emptyMsg={dateFilter || statusFilter ? 'No events match the filters' : 'No events yet'}
            />
          </div>
        )}

      </div>
    </div>
  )
}
