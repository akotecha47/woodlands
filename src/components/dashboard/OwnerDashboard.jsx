import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, AlertCircle, Package, Users, ChevronRight,
  Calendar, Leaf, Search, Bell,
} from 'lucide-react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
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

function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

// White KPI card with a 30 px tinted icon square in the top-left.
// `valueCls` lets callers shrink the number for longer strings (e.g. date).
function KpiCard({ Icon, iconBg, iconColor, label, value, valueCls = 'text-2xl', children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className={`w-[30px] h-[30px] rounded-lg flex items-center justify-center mb-4 ${iconBg}`}>
        <Icon size={15} className={iconColor} />
      </div>
      <p className="text-xs font-medium text-gray-400 tracking-wide mb-1">{label}</p>
      <p className={`${valueCls} font-bold text-gray-900 leading-tight`}>{value}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}

export default function OwnerDashboard() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [attendance,   setAttendance]   = useState(null)
  const [lowStock,     setLowStock]     = useState({ count: 0, departments: [] })
  const [eventCount,   setEventCount]   = useState(null)
  const [bookings,     setBookings]     = useState([])
  const [unverified,   setUnverified]   = useState([])
  const [unpaidEvents, setUnpaidEvents] = useState([])
  const [atRiskCount,  setAtRiskCount]  = useState(0)
  const [loading,      setLoading]      = useState(true)

  const today    = todayISOStr()
  const marketDay = getNextMarketDay()
  const initials  = getInitials(profile?.full_name)

  useEffect(() => {
    async function load() {
      const [attR, stockR, eventsR, bookingsR, unverifiedR, depositPmtsR, atRiskR] = await Promise.all([
        supabaseAdmin
          .from('attendance_records')
          .select('status')
          .eq('date', today),

        supabaseAdmin
          .from('current_stock')
          .select('quantity, stock_items(id, department, reorder_level, is_active)'),

        supabaseAdmin
          .from('events')
          .select('id, title, deposit_amount')
          .gte('event_date', today)
          .neq('status', 'cancelled'),

        supabaseAdmin
          .from('table_bookings')
          .select('id, guest_name, booking_time, party_size, status, tables(table_number, location)')
          .eq('booking_date', today)
          .eq('status', 'confirmed')
          .order('booking_time'),

        supabaseAdmin
          .from('attendance_records')
          .select('id, user_id, user_profiles!user_id(full_name)')
          .eq('status', 'unverified')
          .eq('date', today),

        supabaseAdmin
          .from('event_payments')
          .select('event_id')
          .eq('payment_type', 'deposit'),

        supabaseAdmin
          .from('fm_holders')
          .select('id')
          .eq('status', 'at_risk'),
      ])

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

      setUnverified(
        (unverifiedR.data ?? []).map(r => ({ name: r.user_profiles?.full_name ?? 'Unknown staff' }))
      )

      const paidEventIds = new Set((depositPmtsR.data ?? []).map(p => p.event_id))
      setUnpaidEvents(allEvents.filter(e => Number(e.deposit_amount) > 0 && !paidEventIds.has(e.id)))

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

      {/* ── Top bar ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-7">
        <h1 className="font-brand text-xl font-bold text-gray-900">Dashboard</h1>

        <div className="flex items-center gap-2">
          {/* Search pill — decorative, hidden on very small screens */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-gray-400 text-sm cursor-default select-none">
            <Search size={13} />
            <span className="text-xs">Search…</span>
          </div>

          {/* Bell with notification dot */}
          <div className="relative">
            <button
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
              aria-label="Notifications"
            >
              <Bell size={16} />
            </button>
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full ring-1 ring-white" />
          </div>

          {/* User avatar with initials */}
          <div
            className="w-8 h-8 rounded-full bg-brand-teal flex items-center justify-center text-white text-xs font-bold select-none"
            title={profile?.full_name ?? ''}
          >
            {initials}
          </div>
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

        {/* Attendance — teal icon on teal tint */}
        <KpiCard
          Icon={Users}
          iconBg="bg-brand-teal-tint"
          iconColor="text-brand-teal"
          label="Today's Attendance"
          value={attendance.total}
        >
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-green-700">Present: {attendance.present}</span>
            <span className="text-amber-600">Late:    {attendance.late}</span>
            <span className="text-red-600">Absent:  {attendance.absent}</span>
          </div>
        </KpiCard>

        {/* Low stock — amber icon on amber tint */}
        <KpiCard
          Icon={Package}
          iconBg="bg-amber-50"
          iconColor="text-amber-500"
          label="Low Stock Items"
          value={lowStock.count}
        >
          <p className={`text-xs ${lowStock.count > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
            {lowStock.count === 0 ? 'All items stocked' : 'at or below reorder level'}
          </p>
        </KpiCard>

        {/* Events — navy icon on navy tint */}
        <KpiCard
          Icon={Calendar}
          iconBg="bg-brand-navy-tint"
          iconColor="text-brand-navy"
          label="Upcoming Events"
          value={eventCount}
        >
          <p className="text-xs text-gray-400">from today onwards</p>
        </KpiCard>

        {/* Market day — green icon on green tint; date is longer so shrink value */}
        <KpiCard
          Icon={Leaf}
          iconBg="bg-green-50"
          iconColor="text-green-600"
          label="Next Market Day"
          value={mdDateLabel}
          valueCls="text-base"
        >
          <p className={`text-xs font-medium ${mdDaysColor}`}>{mdDaysLabel}</p>
        </KpiCard>

      </div>

      {/* ── Needs Attention ───────────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Needs Attention</h2>
        </div>
        {attentionItems.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400 text-center">
            All clear — nothing needs attention today.
          </p>
        ) : (
          attentionItems.map(({ key, Icon, iconColor, primary, secondary, link }) => (
            <button
              key={key}
              onClick={() => navigate(link)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 last:border-0"
            >
              <Icon size={16} className={`${iconColor} shrink-0`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 leading-snug">{primary}</p>
                <p className="text-xs text-gray-400 mt-0.5">{secondary}</p>
              </div>
              <ChevronRight size={14} className="text-gray-300 shrink-0" />
            </button>
          ))
        )}
      </section>

      {/* ── Today's confirmed bookings ────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Today's Confirmed Bookings</h2>
          {bookings.length > 0 && (
            <span className="text-xs text-gray-400">
              {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
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
      </section>

    </div>
  )
}
