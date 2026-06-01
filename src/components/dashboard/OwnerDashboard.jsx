import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, AlertCircle, Package, Users, ChevronRight } from 'lucide-react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { Th, Td } from '../admin/AdminUI'

function todayISOStr() {
  return new Date().toISOString().split('T')[0]
}

function fmtTime(t) {
  return t ? t.slice(0, 5) : '—'
}

function lastSaturdayOf(year, month) {
  const last = new Date(year, month + 1, 0)
  const dow  = last.getDay()
  const sub  = (dow + 1) % 7
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
  const navigate = useNavigate()

  const [attendance,   setAttendance]   = useState(null)
  const [lowStock,     setLowStock]     = useState({ count: 0, departments: [] })
  const [eventCount,   setEventCount]   = useState(null)
  const [bookings,     setBookings]     = useState([])
  const [unverified,   setUnverified]   = useState([])
  const [unpaidEvents, setUnpaidEvents] = useState([])
  const [atRiskCount,  setAtRiskCount]  = useState(0)
  const [loading,      setLoading]      = useState(true)

  const today     = todayISOStr()
  const marketDay = getNextMarketDay()

  useEffect(() => {
    async function load() {
      const [attR, stockR, eventsR, bookingsR, unverifiedR, depositPmtsR, atRiskR] = await Promise.all([
        // Attendance status breakdown for KPI card
        // Uses 'date' column (date type, original schema col 001_schema.sql:104)
        supabaseAdmin
          .from('attendance_records')
          .select('status')
          .eq('date', today),

        // Stock levels: quantity lives in current_stock, metadata in stock_items
        // Fetch department + reorder_level + is_active for filtering and display
        supabaseAdmin
          .from('current_stock')
          .select('quantity, stock_items(id, department, reorder_level, is_active)'),

        // Upcoming non-cancelled events; fetch data (not head-only) so we can
        // also derive the unpaid-deposit list without a second round-trip
        supabaseAdmin
          .from('events')
          .select('id, title, deposit_amount')
          .gte('event_date', today)
          .neq('status', 'cancelled'),

        // Today's confirmed table bookings for the bottom table
        supabaseAdmin
          .from('table_bookings')
          .select('id, guest_name, booking_time, party_size, status, tables(table_number, location)')
          .eq('booking_date', today)
          .eq('status', 'confirmed')
          .order('booking_time'),

        // Unverified clock-ins today: attendance_records has two FKs to user_profiles
        // (user_id and recorded_by), so we must use the column-name hint !user_id
        supabaseAdmin
          .from('attendance_records')
          .select('id, user_id, user_profiles!user_id(full_name)')
          .eq('status', 'unverified')
          .eq('date', today),

        // All deposit-type payments — used client-side to determine which upcoming
        // events have already had a deposit paid (event_payments.payment_type added
        // in 003_events_columns.sql)
        supabaseAdmin
          .from('event_payments')
          .select('event_id')
          .eq('payment_type', 'deposit'),

        // At-risk market holders (status value confirmed in CHECK constraint,
        // 009_farmers_market.sql)
        supabaseAdmin
          .from('fm_holders')
          .select('id')
          .eq('status', 'at_risk'),
      ])

      // ── KPI cards ─────────────────────────────────────────────────────────────

      const recs = attR.data ?? []
      setAttendance({
        total:   recs.length,
        present: recs.filter(r => r.status === 'present').length,
        late:    recs.filter(r => r.status === 'late').length,
        absent:  recs.filter(r => r.status === 'absent').length,
      })

      const stockRows = stockR.data ?? []
      const lowItems  = stockRows.filter(
        r => r.stock_items?.is_active && r.quantity <= (r.stock_items?.reorder_level ?? 0)
      )
      const depts = [...new Set(lowItems.map(r => r.stock_items?.department).filter(Boolean))]
      setLowStock({ count: lowItems.length, departments: depts })

      const allEvents = eventsR.data ?? []
      setEventCount(allEvents.length)
      setBookings(bookingsR.data ?? [])

      // ── Needs Attention ───────────────────────────────────────────────────────

      setUnverified(
        (unverifiedR.data ?? []).map(r => ({
          name: r.user_profiles?.full_name ?? 'Unknown staff',
        }))
      )

      const paidEventIds = new Set((depositPmtsR.data ?? []).map(p => p.event_id))
      setUnpaidEvents(
        allEvents.filter(e => Number(e.deposit_amount) > 0 && !paidEventIds.has(e.id))
      )

      setAtRiskCount((atRiskR.data ?? []).length)

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return null

  const { date: mdDate, daysAway } = marketDay
  const mdDateLabel = mdDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const mdDaysLabel = daysAway === 0 ? 'Today!' : daysAway === 1 ? 'Tomorrow' : `${daysAway} days away`
  const mdDaysColor = daysAway === 0 ? 'text-green-600' : daysAway <= 7 ? 'text-amber-600' : 'text-gray-500'

  // Build ordered attention list — sources with zero items produce no rows
  const attentionItems = [
    ...unverified.map(u => ({
      key:       `unv-${u.name}`,
      Icon:      AlertTriangle,
      iconColor: 'text-amber-500',
      primary:   u.name,
      secondary: 'clocked in off-site, needs review',
      link:      '/attendance',
    })),
    ...unpaidEvents.map(e => ({
      key:       `evt-${e.id}`,
      Icon:      AlertCircle,
      iconColor: 'text-red-500',
      primary:   e.title,
      secondary: 'deposit unpaid',
      link:      '/events',
    })),
    ...(lowStock.count > 0 ? [{
      key:       'low-stock',
      Icon:      Package,
      iconColor: 'text-red-500',
      primary:   `${lowStock.count} item${lowStock.count !== 1 ? 's' : ''} below reorder level`,
      secondary: lowStock.departments.length > 0
        ? `Departments affected: ${lowStock.departments.join(', ')}`
        : 'Check inventory',
      link:      '/',
    }] : []),
    ...(atRiskCount > 0 ? [{
      key:       'at-risk',
      Icon:      Users,
      iconColor: 'text-amber-500',
      primary:   `${atRiskCount} holder${atRiskCount !== 1 ? 's' : ''} at risk`,
      secondary: 'no recent market visits',
      link:      '/farmers-market',
    }] : []),
  ]

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-gray-900 mb-5">Dashboard</h1>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

        <Card label="Today's Attendance" accent="blue">
          <p className="text-3xl font-bold text-gray-900 mb-2">{attendance.total}</p>
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-green-700">Present: {attendance.present}</span>
            <span className="text-amber-600">Late: {attendance.late}</span>
            <span className="text-red-600">Absent: {attendance.absent}</span>
          </div>
        </Card>

        <Card label="Low Stock Items" accent={lowStock.count > 0 ? 'amber' : 'gray'}>
          <p className={`text-3xl font-bold mb-2 ${lowStock.count > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
            {lowStock.count}
          </p>
          <p className="text-xs text-gray-500">
            {lowStock.count === 0 ? 'All items stocked' : 'at or below reorder level'}
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

      {/* ── Needs Attention ── */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Needs Attention</h2>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {attentionItems.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              All clear — nothing needs attention today.
            </p>
          ) : (
            attentionItems.map(({ key, Icon, iconColor, primary, secondary, link }) => (
              <button
                key={key}
                onClick={() => navigate(link)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 last:border-0"
              >
                <Icon size={18} className={`${iconColor} shrink-0`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 leading-snug">{primary}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{secondary}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300 shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Today's confirmed bookings ── */}
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold text-gray-700">Today's Confirmed Bookings</h2>
        {bookings.length > 0 && (
          <span className="text-xs text-gray-400">
            {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
          </span>
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
