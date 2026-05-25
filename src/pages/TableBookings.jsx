import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── constants ────────────────────────────────────────────────

const TABS = [
  { id: 'today',    label: "Today's Bookings" },
  { id: 'new',      label: 'New Booking'       },
  { id: 'all',      label: 'All Bookings'      },
  { id: 'calendar', label: 'Calendar'          },
]

const STATUS_CFG = {
  confirmed: { label: 'Confirmed', badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500',   card: 'bg-blue-50 border-blue-200 hover:border-blue-300'   },
  seated:    { label: 'Seated',    badge: 'bg-green-100 text-green-700', dot: 'bg-green-600',  card: 'bg-green-50 border-green-200 hover:border-green-300' },
  completed: { label: 'Completed', badge: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400',   card: 'bg-gray-50 border-gray-200 hover:border-gray-300'   },
  no_show:   { label: 'No Show',   badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500',  card: 'bg-amber-50 border-amber-200 hover:border-amber-300' },
  cancelled: { label: 'Cancelled', badge: 'bg-red-100 text-red-700',     dot: 'bg-red-500',    card: 'bg-red-50 border-red-200 hover:border-red-300'       },
}

// ── date/time helpers ────────────────────────────────────────

const todayStr = () => new Date().toISOString().slice(0, 10)

function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtWeekRange(start) {
  const end = addDays(start, 6)
  const s = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const e = end.toLocaleDateString('en-GB',   { day: 'numeric', month: 'short', year: 'numeric' })
  return `${s} – ${e}`
}

// ── shared UI primitives ─────────────────────────────────────

const fieldCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Inp(props)                    { return <input  className={fieldCls} {...props} /> }
function Sel({ children, ...props })   { return <select className={fieldCls} {...props}>{children}</select> }

function Th({ children }) {
  return (
    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  )
}

function Td({ children, bold = false }) {
  return (
    <td className={`px-4 py-3 text-sm ${bold ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
      {children ?? '—'}
    </td>
  )
}

function EmptyRow({ cols, msg = 'No bookings found' }) {
  return <tr><td colSpan={cols} className="px-4 py-8 text-center text-sm text-gray-400">{msg}</td></tr>
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status]
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg?.badge ?? 'bg-gray-100 text-gray-600'}`}>
      {cfg?.label ?? status}
    </span>
  )
}

function ActionButtons({ booking, onUpdate }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {booking.status === 'confirmed' && (
        <button
          onClick={() => onUpdate(booking.id, 'seated')}
          className="text-xs font-medium px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
        >
          Seat
        </button>
      )}
      {booking.status === 'seated' && (
        <button
          onClick={() => onUpdate(booking.id, 'completed')}
          className="text-xs font-medium px-2.5 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
        >
          Complete
        </button>
      )}
      {(booking.status === 'confirmed' || booking.status === 'seated') && (
        <button
          onClick={() => onUpdate(booking.id, 'no_show')}
          className="text-xs font-medium px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
        >
          No Show
        </button>
      )}
    </div>
  )
}

// ── calendar card ────────────────────────────────────────────

function BookingCard({ booking, onClick }) {
  const cfg = STATUS_CFG[booking.status]
  return (
    <button
      onClick={() => onClick(booking)}
      className={`w-full text-left border rounded-lg p-2 transition-all mb-1 ${cfg?.card ?? 'bg-white border-gray-200'}`}
    >
      <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{booking.customer_name}</p>
      <p className="text-xs text-gray-500 mt-0.5">{fmtTime(booking.booking_date)} · {booking.party_size} pax</p>
    </button>
  )
}

// ── booking detail modal ─────────────────────────────────────

function BookingModal({ booking, onClose }) {
  if (!booking) return null
  const rows = [
    ['Date',       fmtDate(booking.booking_date)],
    ['Time',       fmtTime(booking.booking_date)],
    ['Party Size', `${booking.party_size} guests`],
    ['Table',      booking.table_number],
    ['Phone',      booking.customer_phone],
    ['Notes',      booking.special_requests],
  ].filter(([, v]) => v)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{booking.customer_name}</h3>
            <div className="mt-1"><StatusBadge status={booking.status} /></div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-3 mt-0.5">
            <X size={18} />
          </button>
        </div>
        <dl className="space-y-2.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-gray-500 shrink-0">{label}</dt>
              <dd className="text-gray-900 font-medium text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

// ── bookings table (shared by Today + All) ───────────────────

function BookingsTable({ bookings, onUpdate, emptyMsg, showDate = false }) {
  const cols = showDate ? 9 : 8
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <Th>Guest Name</Th>
            <Th>Phone</Th>
            {showDate && <Th>Date</Th>}
            <Th>Time</Th>
            <Th>Table #</Th>
            <Th>Party Size</Th>
            <Th>Status</Th>
            <Th>Notes</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {bookings.map(b => (
            <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
              <Td bold>{b.customer_name}</Td>
              <Td>{b.customer_phone}</Td>
              {showDate && <Td>{fmtDate(b.booking_date)}</Td>}
              <Td>{fmtTime(b.booking_date)}</Td>
              <Td>{b.table_number}</Td>
              <Td>{b.party_size}</Td>
              <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
              <Td>{b.special_requests}</Td>
              <td className="px-4 py-3">
                <ActionButtons booking={b} onUpdate={onUpdate} />
              </td>
            </tr>
          ))}
          {bookings.length === 0 && <EmptyRow cols={cols} msg={emptyMsg ?? 'No bookings found'} />}
        </tbody>
      </table>
    </div>
  )
}

// ── main component ───────────────────────────────────────────

const BLANK_FORM = {
  customer_name: '', customer_phone: '', booking_date: todayStr(),
  booking_time: '19:00', party_size: '2', table_number: '',
  status: 'confirmed', special_requests: '',
}

export default function TableBookings() {
  const { session } = useAuth()
  const [tab, setTab] = useState('today')

  const [todayBookings, setTodayBookings]   = useState([])
  const [allBookings,   setAllBookings]     = useState([])
  const [calBookings,   setCalBookings]     = useState([])
  const [weekStart,     setWeekStart]       = useState(() => getMonday(new Date()))

  const [dateFilter,    setDateFilter]      = useState('')
  const [form,          setForm]            = useState(BLANK_FORM)
  const [busy,          setBusy]            = useState(false)
  const [toast,         setToast]           = useState(null)
  const [selectedBkg,   setSelectedBkg]     = useState(null)

  function flash(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  // ── fetchers ────────────────────────────────────────────────

  async function fetchToday() {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end   = new Date(start); end.setDate(end.getDate() + 1)
    const { data } = await supabase
      .from('table_bookings').select('*')
      .gte('booking_date', start.toISOString())
      .lt( 'booking_date', end.toISOString())
      .order('booking_date')
    if (data) setTodayBookings(data)
  }

  async function fetchAll() {
    const { data } = await supabase
      .from('table_bookings').select('*')
      .order('booking_date', { ascending: false })
    if (data) setAllBookings(data)
  }

  async function fetchCalendar(start) {
    const end = addDays(start, 7)
    const { data } = await supabase
      .from('table_bookings').select('*')
      .gte('booking_date', start.toISOString())
      .lt( 'booking_date', end.toISOString())
      .order('booking_date')
    if (data) setCalBookings(data)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchToday() }, [])

  useEffect(() => {
    if (tab === 'today')    fetchToday()
    if (tab === 'all')      fetchAll()
    if (tab === 'calendar') fetchCalendar(weekStart)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    if (tab === 'calendar') fetchCalendar(weekStart)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])

  // ── status update ───────────────────────────────────────────

  async function updateStatus(id, status) {
    try {
      const { error } = await supabase.from('table_bookings')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      flash(`Marked as ${STATUS_CFG[status]?.label ?? status}`)
      if (selectedBkg?.id === id) setSelectedBkg(b => ({ ...b, status }))
      if (tab === 'today')    fetchToday()
      if (tab === 'all')      fetchAll()
      if (tab === 'calendar') fetchCalendar(weekStart)
    } catch (err) { flash(err.message, false) }
  }

  // ── new booking ─────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault(); setBusy(true)
    try {
      const bookingDt = new Date(`${form.booking_date}T${form.booking_time}:00`)
      const { error } = await supabase.from('table_bookings').insert({
        customer_name:    form.customer_name,
        customer_phone:   form.customer_phone  || null,
        booking_date:     bookingDt.toISOString(),
        party_size:       Number(form.party_size),
        table_number:     form.table_number    || null,
        status:           form.status,
        special_requests: form.special_requests || null,
        created_by:       session?.user?.id    ?? null,
      })
      if (error) throw error
      flash('Booking created')
      setForm(BLANK_FORM)
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  // ── derived ─────────────────────────────────────────────────

  const filteredAll = dateFilter
    ? allBookings.filter(b => {
        const d = new Date(b.booking_date)
        return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-') === dateFilter
      })
    : allBookings

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today    = new Date()

  // ── render ──────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-gray-900">Table Bookings</h1>

      {toast && (
        <div className={`fixed top-4 right-4 z-40 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <BookingModal booking={selectedBkg} onClose={() => setSelectedBkg(null)} />

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">

        {/* ── Today's Bookings ────────────────────────── */}
        {tab === 'today' && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">
              Today — {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <BookingsTable
              bookings={todayBookings}
              onUpdate={updateStatus}
              emptyMsg="No bookings for today"
            />
          </div>
        )}

        {/* ── New Booking ──────────────────────────────── */}
        {tab === 'new' && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-5">New Booking</h2>
            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Guest Name">
                  <Inp
                    required
                    value={form.customer_name}
                    onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                    placeholder="Full name"
                  />
                </Field>
                <Field label="Phone (optional)">
                  <Inp
                    type="tel"
                    value={form.customer_phone}
                    onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))}
                    placeholder="+265…"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Booking Date">
                  <Inp
                    type="date"
                    required
                    value={form.booking_date}
                    onChange={e => setForm(f => ({ ...f, booking_date: e.target.value }))}
                  />
                </Field>
                <Field label="Booking Time">
                  <Inp
                    type="time"
                    required
                    value={form.booking_time}
                    onChange={e => setForm(f => ({ ...f, booking_time: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Party Size">
                  <Inp
                    type="number"
                    required
                    min="1"
                    value={form.party_size}
                    onChange={e => setForm(f => ({ ...f, party_size: e.target.value }))}
                  />
                </Field>
                <Field label="Table Number (optional)">
                  <Inp
                    value={form.table_number}
                    onChange={e => setForm(f => ({ ...f, table_number: e.target.value }))}
                    placeholder="e.g. T4"
                  />
                </Field>
              </div>

              <Field label="Status">
                <Sel
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="cancelled">Cancelled</option>
                </Sel>
              </Field>

              <Field label="Notes (optional)">
                <textarea
                  rows={2}
                  className={fieldCls}
                  placeholder="Any special requests…"
                  value={form.special_requests}
                  onChange={e => setForm(f => ({ ...f, special_requests: e.target.value }))}
                />
              </Field>

              <button
                type="submit"
                disabled={busy}
                className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Create Booking'}
              </button>
            </form>
          </div>
        )}

        {/* ── All Bookings ─────────────────────────────── */}
        {tab === 'all' && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-semibold text-gray-800">All Bookings</h2>
              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
                {dateFilter && (
                  <button
                    onClick={() => setDateFilter('')}
                    className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-300 rounded-lg transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <BookingsTable
              bookings={filteredAll}
              onUpdate={updateStatus}
              showDate
              emptyMsg={dateFilter ? 'No bookings for this date' : 'No bookings yet'}
            />
          </div>
        )}

        {/* ── Calendar ─────────────────────────────────── */}
        {tab === 'calendar' && (
          <div className="p-6">
            {/* Week navigation */}
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => setWeekStart(d => addDays(d, -7))}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-gray-800">{fmtWeekRange(weekStart)}</span>
              <button
                onClick={() => setWeekStart(d => addDays(d, 7))}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map(day => {
                const isToday_ = sameDay(day, today)
                const dayBookings = calBookings.filter(b => sameDay(new Date(b.booking_date), day))

                return (
                  <div key={day.toISOString()} className="min-h-32">
                    {/* Day header */}
                    <div className={`text-center py-2 mb-2 rounded-lg ${isToday_ ? 'bg-green-600 text-white' : 'bg-gray-50'}`}>
                      <p className={`text-xs font-semibold uppercase tracking-wide ${isToday_ ? 'text-green-100' : 'text-gray-500'}`}>
                        {day.toLocaleDateString('en-GB', { weekday: 'short' })}
                      </p>
                      <p className={`text-sm font-bold mt-0.5 ${isToday_ ? 'text-white' : 'text-gray-900'}`}>
                        {day.getDate()}
                      </p>
                    </div>

                    {/* Booking cards */}
                    <div>
                      {dayBookings.map(b => (
                        <BookingCard
                          key={b.id}
                          booking={b}
                          onClick={setSelectedBkg}
                        />
                      ))}
                      {dayBookings.length === 0 && (
                        <p className="text-center text-xs text-gray-300 mt-3">—</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-5 pt-4 border-t border-gray-100 flex-wrap">
              {Object.entries(STATUS_CFG).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <span className="text-xs text-gray-500">{cfg.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
