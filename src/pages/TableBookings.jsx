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
    purple: 'bg-purple-100 text-purple-700',
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
  return {
    confirmed: 'blue',
    seated:    'green',
    completed: 'gray',
    cancelled: 'red',
    no_show:   'amber',
  }[s] ?? 'gray'
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Tab 1: Today's Bookings ──────────────────────────────────────────────────

function TodaysBookings({ bookings, loading, onRefresh }) {
  const todayStr = new Date().toISOString().split('T')[0]
  const todays = bookings.filter(b => b.booking_date === todayStr)

  async function updateStatus(id, status) {
    await supabase.from('table_bookings').update({ status }).eq('id', id)
    onRefresh()
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {['Guest', 'Phone', 'Table', 'Party', 'Time', 'Status', 'Notes', 'Action'].map(h => (
              <th key={h} className={thCls}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
          ) : todays.length === 0 ? (
            <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No bookings for today.</td></tr>
          ) : todays.map(b => (
            <tr key={b.id} className="hover:bg-gray-50/60">
              <td className={`${tdCls} font-medium text-gray-900`}>{b.guest_name}</td>
              <td className={`${tdCls} text-gray-600`}>{b.guest_phone ?? '—'}</td>
              <td className={`${tdCls} text-gray-600`}>{b.table_number ?? '—'}</td>
              <td className={`${tdCls} tabular-nums text-gray-600`}>{b.party_size}</td>
              <td className={`${tdCls} text-gray-600`}>{b.booking_time ? b.booking_time.slice(0, 5) : '—'}</td>
              <td className={tdCls}><Badge variant={statusVariant(b.status)}>{b.status.replace('_', ' ')}</Badge></td>
              <td className={`${tdCls} text-gray-500 max-w-xs truncate`}>{b.notes ?? '—'}</td>
              <td className={tdCls}>
                {b.status === 'confirmed' && (
                  <button
                    onClick={() => updateStatus(b.id, 'seated')}
                    className="rounded bg-green-600 px-2.5 py-1 text-xs text-white hover:bg-green-700 transition-colors"
                  >
                    Seat
                  </button>
                )}
                {b.status === 'seated' && (
                  <button
                    onClick={() => updateStatus(b.id, 'completed')}
                    className="rounded bg-gray-500 px-2.5 py-1 text-xs text-white hover:bg-gray-600 transition-colors"
                  >
                    Complete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tab 2: New Booking ───────────────────────────────────────────────────────

const todayDate = new Date().toISOString().split('T')[0]
const bookingDefaults = {
  guest_name: '', guest_phone: '', table_number: '',
  party_size: '2', booking_date: todayDate, booking_time: '',
  status: 'confirmed', notes: '',
}

function NewBooking({ onSaved }) {
  const [form, setForm] = useState(bookingDefaults)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true); setError(null); setSuccess(false)

    const payload = {
      guest_name:   form.guest_name,
      guest_phone:  form.guest_phone || null,
      table_number: form.table_number || null,
      party_size:   Number(form.party_size),
      booking_date: form.booking_date,
      booking_time: form.booking_time,
      status:       form.status,
      notes:        form.notes || null,
    }

    const { error: err } = await supabase.from('table_bookings').insert(payload)
    if (err) { setError(err.message); setSubmitting(false); return }

    setSuccess(true)
    setForm(bookingDefaults)
    setSubmitting(false)
    onSaved()
  }

  return (
    <div className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900">New Table Booking</h2>
        {success && <Alert variant="success">Booking created successfully.</Alert>}
        {error   && <Alert variant="error">{error}</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Guest Name</label>
            <input required type="text" value={form.guest_name} onChange={set('guest_name')}
              placeholder="Full name" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input type="tel" value={form.guest_phone} onChange={set('guest_phone')}
              placeholder="Optional" className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Booking Date</label>
            <input required type="date" value={form.booking_date} onChange={set('booking_date')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Booking Time</label>
            <input required type="time" value={form.booking_time} onChange={set('booking_time')} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Party Size</label>
            <input required type="number" min="1" max="100" value={form.party_size} onChange={set('party_size')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Table Number</label>
            <input type="text" value={form.table_number} onChange={set('table_number')}
              placeholder="e.g. T4" className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Status</label>
          <select value={form.status} onChange={set('status')} className={inputCls}>
            <option value="confirmed">Confirmed</option>
            <option value="seated">Seated</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No Show</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Notes</label>
          <textarea value={form.notes} onChange={set('notes')}
            placeholder="Dietary requirements, special occasions…" rows={2}
            className={inputCls + ' resize-none'} />
        </div>

        <button type="submit" disabled={submitting} className={submitBtnCls}>
          {submitting ? 'Saving…' : 'Create Booking'}
        </button>
      </form>
    </div>
  )
}

// ─── Tab 3: All Bookings ──────────────────────────────────────────────────────

function AllBookings({ bookings, loading }) {
  const [dateFilter, setDateFilter] = useState('')

  const filtered = dateFilter
    ? bookings.filter(b => b.booking_date === dateFilter)
    : bookings

  return (
    <div className="space-y-4">
      <div>
        <input
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]"
        />
        {dateFilter && (
          <button onClick={() => setDateFilter('')} className="ml-2 text-sm text-gray-400 hover:text-gray-600">
            Clear
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Guest', 'Phone', 'Date', 'Time', 'Table', 'Party', 'Status', 'Notes'].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No bookings found.</td></tr>
            ) : filtered.map(b => (
              <tr key={b.id} className="hover:bg-gray-50/60">
                <td className={`${tdCls} font-medium text-gray-900`}>{b.guest_name}</td>
                <td className={`${tdCls} text-gray-600`}>{b.guest_phone ?? '—'}</td>
                <td className={`${tdCls} text-gray-600`}>{fmtDate(b.booking_date)}</td>
                <td className={`${tdCls} text-gray-600`}>{b.booking_time ? b.booking_time.slice(0, 5) : '—'}</td>
                <td className={`${tdCls} text-gray-600`}>{b.table_number ?? '—'}</td>
                <td className={`${tdCls} tabular-nums text-gray-600`}>{b.party_size}</td>
                <td className={tdCls}><Badge variant={statusVariant(b.status)}>{b.status.replace('_', ' ')}</Badge></td>
                <td className={`${tdCls} text-gray-500 max-w-xs truncate`}>{b.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = ["Today's Bookings", 'New Booking', 'All Bookings']

export default function TableBookings() {
  const [tab, setTab] = useState(0)
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('table_bookings')
      .select('*')
      .order('booking_date', { ascending: false })
      .order('booking_time', { ascending: true })
    setBookings(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Table Bookings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage restaurant and dining table reservations.
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

      {tab === 0 && <TodaysBookings bookings={bookings} loading={loading} onRefresh={fetchBookings} />}
      {tab === 1 && <NewBooking onSaved={() => { fetchBookings(); setTab(0) }} />}
      {tab === 2 && <AllBookings bookings={bookings} loading={loading} />}
    </div>
  )
}
