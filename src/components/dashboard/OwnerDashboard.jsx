import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { Th, Td } from '../admin/AdminUI'

function todayISOStr() {
  return new Date().toISOString().slice(0, 10)
}

function fmtTime(t) {
  return t ? t.slice(0, 5) : '—'
}

function lastSaturdayOf(year, month) {
  const last = new Date(year, month + 1, 0)
  const dow  = last.getDay() // 0=Sun … 6=Sat
  const sub  = (dow + 1) % 7 // days back to reach Saturday
  const sat  = new Date(last)
  sat.setDate(last.getDate() - sub)
  return sat
}

function getNextMarketDay() {
  const now      = new Date()
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let   candidate = lastSaturdayOf(now.getFullYear(), now.getMonth())
  if (candidate < todayMid) {
    const nm = now.getMonth() === 11 ? 0 : now.getMonth() + 1
    const ny = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
    candidate = lastSaturdayOf(ny, nm)
  }
  const daysAway = Math.round((candidate - todayMid) / 86400000)
  return { date: candidate, daysAway }
}

function Card({ label, accent = 'gray', children }) {
  const bg = {
    gray:   'bg-gray-50   border-transparent',
    blue:   'bg-blue-50   border-blue-100',
    amber:  'bg-amber-50  border-amber-200',
    green:  'bg-green-50  border-green-100',
    purple: 'bg-purple-50 border-purple-100',
  }[accent]
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{label}</p>
      {children}
    </div>
  )
}

export default function OwnerDashboard() {
  const [attendance, setAttendance] = useState(null)
  const [lowStock,   setLowStock]   = useState(null)
  const [eventCount, setEventCount] = useState(null)
  const [bookings,   setBookings]   = useState([])
  const [loading,    setLoading]    = useState(true)

  const today     = todayISOStr()
  const marketDay = getNextMarketDay()

  useEffect(() => {
    async function load() {
      const [attR, stockR, eventsR, bookingsR] = await Promise.all([
        supabaseAdmin
          .from('attendance_records')
          .select('status')
          .eq('shift_date', today),

        supabaseAdmin
          .from('current_stock')
          .select('quantity, stock_items(reorder_level)'),

        supabaseAdmin
          .from('events')
          .select('*', { count: 'exact', head: true })
          .gte('event_date', today)
          .neq('status', 'cancelled'),

        supabaseAdmin
          .from('table_bookings')
          .select('id, guest_name, booking_time, party_size, status, tables(table_number, location)')
          .eq('booking_date', today)
          .eq('status', 'confirmed')
          .order('booking_time'),
      ])

      const recs = attR.data ?? []
      setAttendance({
        total:   recs.length,
        present: recs.filter(r => r.status === 'present').length,
        late:    recs.filter(r => r.status === 'late').length,
        absent:  recs.filter(r => r.status === 'absent').length,
      })

      const stockRows = stockR.data ?? []
      setLowStock(stockRows.filter(r => r.quantity <= (r.stock_items?.reorder_level ?? 0)).length)

      setEventCount(eventsR.count ?? 0)
      setBookings(bookingsR.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return null

  const { date: mdDate, daysAway } = marketDay
  const mdDateLabel = mdDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const mdDaysLabel = daysAway === 0 ? 'Today!' : daysAway === 1 ? 'Tomorrow' : `${daysAway} days away`
  const mdDaysColor = daysAway === 0 ? 'text-green-600' : daysAway <= 7 ? 'text-amber-600' : 'text-gray-500'

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-gray-900 mb-5">Dashboard</h1>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

        <Card label="Today's Attendance" accent="blue">
          <p className="text-3xl font-bold text-gray-900 mb-2">{attendance.total}</p>
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-green-700">Present: {attendance.present}</span>
            <span className="text-amber-600">Late: {attendance.late}</span>
            <span className="text-red-600">Absent: {attendance.absent}</span>
          </div>
        </Card>

        <Card label="Low Stock Items" accent={lowStock > 0 ? 'amber' : 'gray'}>
          <p className={`text-3xl font-bold mb-2 ${lowStock > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
            {lowStock}
          </p>
          <p className="text-xs text-gray-500">
            {lowStock === 0 ? 'All items stocked' : 'at or below reorder level'}
          </p>
        </Card>

        <Card label="Upcoming Events" accent="green">
          <p className="text-3xl font-bold text-gray-900 mb-2">{eventCount}</p>
          <p className="text-xs text-gray-500">from today onwards</p>
        </Card>

        <Card label="Next Market Day" accent="purple">
          <p className="text-base font-semibold text-gray-900 mb-1">{mdDateLabel}</p>
          <p className={`text-xs font-medium ${mdDaysColor}`}>{mdDaysLabel}</p>
        </Card>

      </div>

      {/* ── Today's confirmed bookings ── */}
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold text-gray-700">Today's Confirmed Bookings</h2>
        {bookings.length > 0 && (
          <span className="text-xs text-gray-400">{bookings.length} booking{bookings.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Time</Th>
              <Th>Guest Name</Th>
              <Th>Party Size</Th>
              <Th>Table</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {bookings.map(b => (
              <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <Td>{fmtTime(b.booking_time)}</Td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{b.guest_name}</td>
                <Td>{b.party_size}</Td>
                <Td>
                  {b.tables
                    ? `${b.tables.table_number}${b.tables.location ? ` · ${b.tables.location}` : ''}`
                    : '—'}
                </Td>
                <td className="px-4 py-3">
                  <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                    Confirmed
                  </span>
                </td>
              </tr>
            ))}
            {bookings.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  No confirmed bookings for today
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
