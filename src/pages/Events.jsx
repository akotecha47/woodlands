import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Shared ───────────────────────────────────────────────────────────────────

function Badge({ variant, children }) {
  const cls = {
    green:  'bg-green-100 text-green-700',
    blue:   'bg-blue-100 text-blue-700',
    amber:  'bg-amber-100 text-amber-700',
    gray:   'bg-gray-100 text-gray-600',
    red:    'bg-red-100 text-red-700',
  }[variant] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  )
}

function Alert({ variant, children }) {
  const cls = variant === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-green-50 border-green-200 text-green-700'
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 ' +
  'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
const submitBtnCls =
  'w-full rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-medium text-white ' +
  'hover:bg-[#15803d] focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50 ' +
  'disabled:opacity-50 transition-colors'
const thCls =
  'whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500'
const tdCls = 'px-4 py-3'

function statusVariant(s) {
  return { upcoming: 'blue', ongoing: 'green', completed: 'gray', cancelled: 'red' }[s] ?? 'gray'
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Tab 1: Upcoming Events ───────────────────────────────────────────────────

function UpcomingEvents({ events, loading }) {
  const today = new Date().toISOString().split('T')[0]
  const upcoming = events.filter(e => e.event_date >= today && e.status !== 'cancelled')

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {['Title', 'Date', 'Time', 'Location', 'Capacity', 'Status'].map(h => (
              <th key={h} className={thCls}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
          ) : upcoming.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No upcoming events.</td></tr>
          ) : upcoming.map(ev => (
            <tr key={ev.id} className="hover:bg-gray-50/60">
              <td className={`${tdCls} font-medium text-gray-900`}>{ev.title}</td>
              <td className={`${tdCls} text-gray-600`}>{fmtDate(ev.event_date)}</td>
              <td className={`${tdCls} text-gray-600`}>{ev.start_time ? ev.start_time.slice(0, 5) : '—'}{ev.end_time ? ` – ${ev.end_time.slice(0, 5)}` : ''}</td>
              <td className={`${tdCls} text-gray-600`}>{ev.location ?? '—'}</td>
              <td className={`${tdCls} tabular-nums text-gray-600`}>{ev.capacity ?? '—'}</td>
              <td className={tdCls}><Badge variant={statusVariant(ev.status)}>{ev.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tab 2: Add Event ─────────────────────────────────────────────────────────

const today = new Date().toISOString().split('T')[0]
const eventDefaults = {
  title: '', description: '', event_date: today,
  start_time: '', end_time: '', location: '', capacity: '', status: 'upcoming',
}

function AddEvent({ onSaved }) {
  const [form, setForm] = useState(eventDefaults)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true); setError(null); setSuccess(false)

    const payload = {
      title:       form.title,
      description: form.description || null,
      event_date:  form.event_date,
      start_time:  form.start_time || null,
      end_time:    form.end_time || null,
      location:    form.location || null,
      capacity:    form.capacity ? Number(form.capacity) : null,
      status:      form.status,
    }

    const { error: err } = await supabase.from('events').insert(payload)
    if (err) { setError(err.message); setSubmitting(false); return }

    setSuccess(true)
    setForm(eventDefaults)
    setSubmitting(false)
    onSaved()
  }

  return (
    <div className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900">Add New Event</h2>
        {success && <Alert variant="success">Event created successfully.</Alert>}
        {error   && <Alert variant="error">{error}</Alert>}

        <div>
          <label className={labelCls}>Title</label>
          <input required type="text" value={form.title} onChange={set('title')}
            placeholder="Event title" className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <textarea value={form.description} onChange={set('description')}
            placeholder="Optional description" rows={2}
            className={inputCls + ' resize-none'} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Date</label>
            <input required type="date" value={form.event_date} onChange={set('event_date')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Location</label>
            <input type="text" value={form.location} onChange={set('location')}
              placeholder="e.g. Main Hall" className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Start Time</label>
            <input type="time" value={form.start_time} onChange={set('start_time')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>End Time</label>
            <input type="time" value={form.end_time} onChange={set('end_time')} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Capacity</label>
            <input type="number" min="1" value={form.capacity} onChange={set('capacity')}
              placeholder="Optional" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select value={form.status} onChange={set('status')} className={inputCls}>
              <option value="upcoming">Upcoming</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <button type="submit" disabled={submitting} className={submitBtnCls}>
          {submitting ? 'Saving…' : 'Create Event'}
        </button>
      </form>
    </div>
  )
}

// ─── Tab 3: All Events ────────────────────────────────────────────────────────

function AllEvents({ events, loading }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {['Title', 'Date', 'Time', 'Location', 'Capacity', 'Status'].map(h => (
              <th key={h} className={thCls}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
          ) : events.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No events yet.</td></tr>
          ) : events.map(ev => (
            <tr key={ev.id} className="hover:bg-gray-50/60">
              <td className={`${tdCls} font-medium text-gray-900`}>{ev.title}</td>
              <td className={`${tdCls} text-gray-600`}>{fmtDate(ev.event_date)}</td>
              <td className={`${tdCls} text-gray-600`}>{ev.start_time ? ev.start_time.slice(0, 5) : '—'}{ev.end_time ? ` – ${ev.end_time.slice(0, 5)}` : ''}</td>
              <td className={`${tdCls} text-gray-600`}>{ev.location ?? '—'}</td>
              <td className={`${tdCls} tabular-nums text-gray-600`}>{ev.capacity ?? '—'}</td>
              <td className={tdCls}><Badge variant={statusVariant(ev.status)}>{ev.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = ['Upcoming', 'Add Event', 'All Events']

export default function Events() {
  const [tab, setTab] = useState(0)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
    setEvents(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Events Tracker</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track and manage lodge events, activities, and functions.
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

      {tab === 0 && <UpcomingEvents events={events} loading={loading} />}
      {tab === 1 && <AddEvent onSaved={() => { fetchEvents(); setTab(0) }} />}
      {tab === 2 && <AllEvents events={events} loading={loading} />}
    </div>
  )
}
