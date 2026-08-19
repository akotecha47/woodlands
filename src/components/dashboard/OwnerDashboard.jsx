import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, AlertCircle, Package, Users, ChevronRight,
  Calendar, Leaf, Search, Bell,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTE_ACCESS } from '../../lib/roles'
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
// Same shape as EventsUI.fmtMWK / FarmersMarketUI.fmtMWK. Held locally rather
// than imported: this module does not otherwise reach across into a feature
// folder, and lib/ has no currency helper to share yet.
function fmtMWK(n) {
  return `MWK ${Number(n || 0).toLocaleString('en-US')}`
}

// U-01: each card navigates to the module it summarises. Navigation only --
// nothing is read or written differently. A card with no `onClick` still
// renders as the plain div it always did, so the component stays usable
// un-linked. The <button> carries type="button" because these can sit inside a
// form in future; text-left undoes the browser's centring.
function KpiCard({ Icon, iconBg, iconColor, label, value, valueCls = 'text-2xl', onClick, ariaLabel, children }) {
  const body = (
    <>
      <div className={`w-[30px] h-[30px] rounded-lg flex items-center justify-center mb-4 ${iconBg}`}>
        <Icon size={15} className={iconColor} />
      </div>
      <p className="text-xs font-medium text-gray-400 tracking-wide mb-1">{label}</p>
      <p className={`${valueCls} font-bold text-gray-900 leading-tight`}>{value}</p>
      {children && <div className="mt-2">{children}</div>}
    </>
  )
  const base = 'bg-white border border-gray-200 rounded-lg p-5'
  if (!onClick) return <div className={base}>{body}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className={`${base} w-full text-left cursor-pointer transition-colors hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-teal`}
    >
      {body}
    </button>
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

  // This dashboard is shared by all four roles (ROUTE_ACCESS['/dashboard']),
  // but the modules it summarises are not. Every panel here is gated on whether
  // the current role can actually open the module the data comes from, using the
  // same source of truth as RouteGuard and Sidebar.
  //
  // Applies to KPI cards, the Needs Attention list and the bookings section
  // alike. A first pass gated only the Needs Attention links, which left
  // kitchen_manager and restaurant_manager still seeing Today's Attendance and
  // Upcoming Events cards for modules they cannot reach.
  const canAccess = path => ROUTE_ACCESS[path]?.includes(profile?.role) ?? false

  const canSeeAttendance    = canAccess('/attendance')
  const canSeeInventory     = canAccess('/')
  const canSeeEvents        = canAccess('/events')
  const canSeeBookings      = canAccess('/table-bookings')
  const canSeeFarmersMarket = canAccess('/farmers-market')

  // Tailwind needs literal class names, so map the count rather than
  // interpolating it. Floored at three columns: a role with one visible card
  // would otherwise get lg:grid-cols-1 and a single card stretched across the
  // whole page, which reads worse than a normal-width card with space beside it.
  const visibleKpiCount = [
    canSeeAttendance, canSeeInventory, canSeeEvents, canSeeFarmersMarket,
  ].filter(Boolean).length
  const kpiColsClass = visibleKpiCount >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'

  useEffect(() => {
    async function load() {
      const [attR, stockR, eventsR, bookingsR, unverifiedR, atRiskR] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('status')
          .eq('date', today),

        // Department tier only — see migration 051. Counting the main-store
        // tier here as well would roughly double the low-stock figure.
        supabase
          .from('current_stock')
          .select('quantity, stock_items(id, department, reorder_level, is_active)')
          .eq('tier', 'department'),

        // `name`, not `title`: the app has only ever written `name` (title is
        // NULL on every live row, schema residue). `deposit_required` is the
        // figure that is actually set when an event is quoted; `deposit_amount`
        // is written by nothing in src/ and is 0 live, which is what made the
        // unpaid-deposit card unreachable. AUDIT_3 C-01.
        supabase
          .from('events')
          .select('id, name, status, deposit_required, deposit_paid')
          .gte('event_date', today)
          .neq('status', 'cancelled'),

        supabase
          .from('table_bookings')
          .select('id, guest_name, booking_time, party_size, status, tables(table_number, location)')
          .eq('booking_date', today)
          .eq('status', 'confirmed')
          .order('booking_time'),

        // Named via `staff`, NOT `user_profiles`. attendance_records carries
        // both a staff_id (FK -> staff, the 62-row roster these screens operate
        // on) and a user_id (FK -> auth.users, only ever set by a self-service
        // clock-in). Every live row is manager-written: staff_id is populated on
        // 15/15 and user_id is NULL on 15/15 (measured), so the old
        // user_profiles!user_id embed resolved to nothing and every card read
        // "Unknown staff". AUDIT_3 C-27.
        supabase
          .from('attendance_records')
          // Bare `staff(...)` embed, not `staff!staff_id(...)`: attendance_records
          // has exactly ONE foreign key to staff (attendance_records_staff_id_fkey
          // on staff_id, measured), so the relationship is unambiguous, and every
          // other embed that works in this codebase is written in this bare form.
          .select('id, staff_id, staff(full_name, department)')
          .eq('status', 'unverified')
          .eq('date', today),


        supabase
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
        (unverifiedR.data ?? []).map(r => ({
          key:  r.id,
          name: r.staff?.full_name ?? 'Unknown staff',
          dept: r.staff?.department ?? null,
        }))
      )

      // Reads events.deposit_paid rather than deriving "a deposit row exists".
      // Since migration 062 a deposit can be REVERSED, and a derived-from-rows
      // test would still see the reversed original and keep reporting the
      // deposit as paid. deposit_paid is recomputed inside
      // reverse_event_payment() in the same transaction as the reversal, and it
      // is already the definition the Events List highlight uses — so this
      // removes a second, now-wrong definition rather than adding one.
      // The gate is CONFIRMED-and-not-paid: confirming an event is the point at
      // which its deposit is owed. That is character-for-character the rule the
      // Events List already highlights amber with (EventsListTab.jsx:39), so the
      // two surfaces cannot disagree. The old test was
      // `Number(e.deposit_amount) > 0`, and deposit_amount is written by no code
      // in src/ and is 0 on the live event — the card could never appear.
      setUnpaidEvents(allEvents.filter(e => e.status === 'confirmed' && !e.deposit_paid))

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
      // Keyed on the record id, not the name: two unverified rows for people
      // with the same name would otherwise collide on one React key.
      key:       `unv-${u.key}`,
      Icon:      AlertTriangle,
      iconColor: 'text-amber-500',
      primary:   u.name,
      secondary: u.dept
        ? `${u.dept} — clocked in off-site, needs review`
        : 'clocked in off-site, needs review',
      link:      '/attendance',
    })),
    ...unpaidEvents.map(e => ({
      key:       `evt-${e.id}`,
      Icon:      AlertCircle,
      iconColor: 'text-red-500',
      primary:   e.name,                       // was e.title, NULL on every row (C-01)
      secondary: Number(e.deposit_required) > 0
        ? `Deposit of ${fmtMWK(e.deposit_required)} unpaid`
        : 'Deposit unpaid',
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
    ...(canSeeFarmersMarket && atRiskCount > 0 ? [{
      key:       'at-risk',
      Icon:      Users,
      iconColor: 'text-amber-500',
      primary:   `${atRiskCount} holder${atRiskCount !== 1 ? 's' : ''} at risk`,
      secondary: 'no recent market visits',
      link:      '/farmers-market',
    }] : []),
  ]
    // Never show a card that would bounce the current role to /login. Every
    // item navigates via navigate(link), which lands on GuardedPage, so a link
    // to a route this role lacks is a dead card.
    //
    // The reported case was the low-stock card pointing at '/', which had no
    // ROUTE_ACCESS entry at all and so bounced every role — fixed by the route
    // key correction. But '/attendance' and '/events' are owner/manager only
    // while their cards rendered for all four roles, so kitchen_manager and
    // restaurant_manager still had dead cards. Filtering against ROUTE_ACCESS
    // fixes both and any future item, using the same source of truth the guard
    // and the sidebar use.
    .filter(item => ROUTE_ACCESS[item.link]?.includes(profile?.role))

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

      {/* ── KPI cards ───────────────────────────────────────────────────────────
          Each card is gated on access to the module it summarises, and the
          column count follows the visible-card count so hidden cards leave no
          dead slot in the row. */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 ${kpiColsClass}`}>

        {/* Attendance — teal icon on teal tint. owner/manager. */}
        {canSeeAttendance && (
          <KpiCard
            Icon={Users}
            iconBg="bg-brand-teal-tint"
            iconColor="text-brand-teal"
            label="Today's Attendance"
            value={attendance.total}
            onClick={() => navigate('/attendance')}
            ariaLabel="Today's Attendance — open Attendance"
          >
            <div className="flex flex-col gap-0.5 text-xs">
              <span className="text-green-700">Present: {attendance.present}</span>
              <span className="text-amber-600">Late:    {attendance.late}</span>
              <span className="text-red-600">Absent:  {attendance.absent}</span>
            </div>
          </KpiCard>
        )}

        {/* Low stock — amber icon on amber tint. All four roles can open
            Inventory (ROUTE_ACCESS['/']), so this stays visible to all. */}
        {canSeeInventory && (
          <KpiCard
            Icon={Package}
            iconBg="bg-amber-50"
            iconColor="text-amber-500"
            label="Low Stock Items"
            value={lowStock.count}
            onClick={() => navigate('/')}
            ariaLabel="Low Stock Items — open Inventory"
          >
            <p className={`text-xs ${lowStock.count > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
              {lowStock.count === 0 ? 'All items stocked' : 'at or below reorder level'}
            </p>
          </KpiCard>
        )}

        {/* Events — navy icon on navy tint. owner/manager. */}
        {canSeeEvents && (
          <KpiCard
            Icon={Calendar}
            iconBg="bg-brand-navy-tint"
            iconColor="text-brand-navy"
            label="Upcoming Events"
            value={eventCount}
            onClick={() => navigate('/events')}
            ariaLabel="Upcoming Events — open Events"
          >
            <p className="text-xs text-gray-400">from today onwards</p>
          </KpiCard>
        )}

        {/* Market day — green icon on green tint; date is longer so shrink value.
            Owner/manager only: Farmers Market is not a kitchen_manager or
            restaurant_manager surface. */}
        {canSeeFarmersMarket && (
          <KpiCard
            Icon={Leaf}
            iconBg="bg-green-50"
            iconColor="text-green-600"
            label="Next Market Day"
            value={mdDateLabel}
            valueCls="text-base"
            onClick={() => navigate('/farmers-market')}
            ariaLabel="Next Market Day — open Farmers Market"
          >
            <p className={`text-xs font-medium ${mdDaysColor}`}>{mdDaysLabel}</p>
          </KpiCard>
        )}

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

      {/* ── Today's confirmed bookings ──────────────────────────────────────────
          owner / manager / restaurant_manager. Same leakage class as the KPI
          cards: kitchen_manager cannot open Table Bookings, so they should not
          see guest names and party sizes on the dashboard either. */}
      {canSeeBookings && (
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
      )}

    </div>
  )
}
