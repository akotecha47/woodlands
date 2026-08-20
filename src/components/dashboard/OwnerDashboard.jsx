import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, AlertCircle, Package, Users, ChevronRight,
  Calendar, Leaf, RefreshCw, CheckCircle2, CalendarClock,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROUTE_ACCESS } from '../../lib/roles'
import { useAuth } from '../../contexts/AuthContext'
import {
  Card, CardHeader, Th, Td, TdBold, Thead, TableWrap, EmptyState,
  Badge, StatBand, StatCell, EmptyRow,
} from '../ui/kit'

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

// Same shape as EventsUI.fmtMWK / FarmersMarketUI.fmtMWK. Held locally rather
// than imported: this module does not otherwise reach across into a feature
// folder, and lib/ has no currency helper to share yet.
function fmtMWK(n) {
  return `MWK ${Number(n || 0).toLocaleString('en-US')}`
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
  // HONESTY: the screen states when it last loaded, not that it is "live".
  // Nothing here subscribes to realtime, so a "live" claim would be one the
  // screen cannot deliver. Stamped at the end of load(), so it is the moment
  // the data actually arrived.
  const [loadedAt,     setLoadedAt]     = useState(null)
  const [refreshing,   setRefreshing]   = useState(false)

  const today     = todayISOStr()
  const marketDay = getNextMarketDay()

  // This dashboard is shared by all four roles (ROUTE_ACCESS['/dashboard']),
  // but the modules it summarises are not. Every panel here is gated on whether
  // the current role can actually open the module the data comes from, using the
  // same source of truth as RouteGuard and Sidebar.
  const canAccess = path => ROUTE_ACCESS[path]?.includes(profile?.role) ?? false

  const canSeeAttendance    = canAccess('/attendance')
  const canSeeInventory     = canAccess('/')
  const canSeeEvents        = canAccess('/events')
  const canSeeBookings      = canAccess('/table-bookings')
  const canSeeFarmersMarket = canAccess('/farmers-market')

  // Tailwind needs literal class names, so map the count rather than
  // interpolating it. Floored at three columns: a role with one visible card
  // would otherwise get lg:grid-cols-1 and a single card stretched across the
  // whole band, which reads worse than a normal-width cell with space beside it.
  const visibleKpiCount = [
    canSeeAttendance, canSeeInventory, canSeeEvents, canSeeFarmersMarket,
  ].filter(Boolean).length
  const kpiColsClass = visibleKpiCount >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'

  // UNCHANGED FROM BLOCK 1 — every query below reads exactly what it read
  // before. Block 2 restyled this screen; it did not re-point a single read.
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
    // deposit as paid. The gate is CONFIRMED-and-not-paid, character for
    // character the Events List amber rule (EventsListTab.jsx:39), so the two
    // surfaces cannot disagree.
    setUnpaidEvents(allEvents.filter(e => e.status === 'confirmed' && !e.deposit_paid))

    setAtRiskCount((atRiskR.data ?? []).length)
    setLoadedAt(new Date())
    setLoading(false)
  }

  // `load` is hoisted out of the effect (Block 2) so handleRefresh can reuse
  // the exact same read path rather than keeping a second copy of it. Kicking
  // it off from a microtask keeps the effect body itself free of a synchronous
  // setState, which is what react-hooks/set-state-in-effect is guarding
  // against. Same queries, same order, same first paint.
  useEffect(() => {
    let live = true
    Promise.resolve().then(() => { if (live) load() })
    return () => { live = false }
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    try { await load() } finally { setRefreshing(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-7 h-7 border-[3px] border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const now = new Date()
  const dateEyebrow = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const freshness = loadedAt
    ? `As of ${loadedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}, ` +
      `${loadedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : 'Not yet loaded'

  const { date: mdDate, daysAway } = marketDay
  const mdDateLabel  = mdDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const mdDateBig    = mdDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  const mdWeekday    = mdDate.toLocaleDateString('en-GB', { weekday: 'long' })
  const mdDaysLabel  = daysAway === 0 ? 'Today' : daysAway === 1 ? 'Tomorrow' : `${daysAway} days away`

  const attentionItems = [
    ...unverified.map(u => ({
      // Keyed on the record id, not the name: two unverified rows for people
      // with the same name would otherwise collide on one React key.
      key:       `unv-${u.key}`,
      Icon:      AlertTriangle,
      tone:      'warn',
      primary:   u.name,
      secondary: u.dept
        ? `${u.dept} — clocked in off-site, needs review`
        : 'Clocked in off-site, needs review',
      link:      '/attendance',
    })),
    ...unpaidEvents.map(e => ({
      key:       `evt-${e.id}`,
      Icon:      AlertCircle,
      tone:      'alert',
      primary:   e.name,                       // was e.title, NULL on every row (C-01)
      secondary: Number(e.deposit_required) > 0
        ? `Deposit of ${fmtMWK(e.deposit_required)} unpaid`
        : 'Deposit unpaid',
      link:      '/events',
    })),
    ...(lowStock.count > 0 ? [{
      key:       'low-stock',
      Icon:      Package,
      tone:      'alert',
      primary:   `${lowStock.count} item${lowStock.count !== 1 ? 's' : ''} below reorder level`,
      secondary: lowStock.departments.length > 0
        ? `Departments affected: ${lowStock.departments.join(', ')}`
        : 'Check inventory',
      link:      '/',
    }] : []),
    ...(canSeeFarmersMarket && atRiskCount > 0 ? [{
      key:       'at-risk',
      Icon:      Users,
      tone:      'warn',
      primary:   `${atRiskCount} stallholder${atRiskCount !== 1 ? 's' : ''} at risk`,
      secondary: 'No recent market visits',
      link:      '/farmers-market',
    }] : []),
  ]
    // Never show a card that would bounce the current role to /login. Every
    // item navigates via navigate(link), which lands on GuardedPage, so a link
    // to a route this role lacks is a dead card. Same source of truth as the
    // guard and the sidebar.
    .filter(item => ROUTE_ACCESS[item.link]?.includes(profile?.role))

  const toneIcon = { warn: 'text-amber-600', alert: 'text-alert', ok: 'text-green-600' }

  return (
    <div className="space-y-6">

      {/* ── Page head ────────────────────────────────────────────────────────
          No greeting line: it says nothing and dates the screen the moment
          somebody reads it aloud at 4pm. The date is a teal eyebrow instead. */}
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-teal mb-1.5">
            {dateEyebrow}
          </p>
          <h1 className="text-[27px] font-bold text-navy tracking-[-.02em] leading-tight">
            Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-soft">
          <span className="tnum">{freshness}</span>
          <span className="text-gray-300" aria-hidden="true">·</span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 font-semibold text-teal hover:text-teal-deep wl-transition disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── The hero band ────────────────────────────────────────────────────
          The dashboard's signature, and deliberately only the dashboard's: no
          other screen gets hero numbers. Each cell is gated on access to the
          module it summarises, and the column count follows the visible-cell
          count so a hidden cell leaves no dead slot in the row.

          U-01: every cell navigates to its module. Navigation only — nothing
          is read or written differently. */}
      <StatBand className={kpiColsClass}>

        {canSeeAttendance && (
          <StatCell
            Icon={Users}
            ChevronIcon={ChevronRight}
            label="Today's Attendance"
            value={attendance.total}
            onClick={() => navigate('/attendance')}
            ariaLabel="Today's Attendance — open Attendance"
            foot={
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="ok">{attendance.present} present</Badge>
                <Badge tone="warn">{attendance.late} late</Badge>
                <Badge tone="alert">{attendance.absent} absent</Badge>
              </div>
            }
          />
        )}

        {canSeeInventory && (
          <StatCell
            Icon={Package}
            ChevronIcon={ChevronRight}
            label="Low Stock"
            value={lowStock.count}
            onClick={() => navigate('/')}
            ariaLabel="Low Stock — open Inventory"
            foot={
              <p className="text-xs text-ink-soft">
                {lowStock.count === 0
                  ? 'Everything above reorder level'
                  : 'at or below reorder level'}
              </p>
            }
          />
        )}

        {canSeeEvents && (
          <StatCell
            Icon={Calendar}
            ChevronIcon={ChevronRight}
            label="Upcoming Events"
            value={eventCount}
            onClick={() => navigate('/events')}
            ariaLabel="Upcoming Events — open Events"
            foot={<p className="text-xs text-ink-soft">From today onwards</p>}
          />
        )}

        {canSeeFarmersMarket && (
          <StatCell
            Icon={Leaf}
            ChevronIcon={ChevronRight}
            label="Next Market Day"
            value={mdDateLabel}
            valueCls="text-[22px]"
            onClick={() => navigate('/farmers-market')}
            ariaLabel="Next Market Day — open Farmers Market"
            foot={<Badge tone="brand">{mdDaysLabel}</Badge>}
          />
        )}

      </StatBand>

      {/* ── Needs attention + Farmers Market ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        <Card className={canSeeFarmersMarket ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <CardHeader
            title="Needs attention"
            action={
              attentionItems.length > 0 && (
                <Badge tone="alert">{attentionItems.length}</Badge>
              )
            }
          />
          {attentionItems.length === 0 ? (
            <EmptyState
              Icon={CheckCircle2}
              title="All clear"
              body="Nothing is waiting on a decision today. Unverified clock-ins, unpaid deposits and low stock appear here as they happen."
            />
          ) : (
            <div>
              {attentionItems.map(({ key, Icon, tone, primary, secondary, link }) => (
                <button
                  key={key}
                  onClick={() => navigate(link)}
                  className="group w-full flex items-center gap-3.5 px-5 py-4 text-left border-b border-line last:border-0 hover:bg-gray-50 wl-transition"
                >
                  <Icon size={17} className={`${toneIcon[tone]} shrink-0`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy leading-snug truncate">{primary}</p>
                    <p className="text-xs text-ink-soft mt-1">{secondary}</p>
                  </div>
                  <ChevronRight
                    size={15}
                    aria-hidden="true"
                    className="text-gray-300 shrink-0 wl-transition group-hover:text-teal group-hover:translate-x-0.5"
                  />
                </button>
              ))}
            </div>
          )}
        </Card>

        {canSeeFarmersMarket && (
          <Card>
            <CardHeader
              title="Farmers Market"
              action={
                <button
                  type="button"
                  onClick={() => navigate('/farmers-market')}
                  className="text-xs font-bold text-teal hover:text-teal-deep wl-transition"
                >
                  Open
                </button>
              }
            />
            <div className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-[.09em] text-ink-soft">
                Next market day
              </p>
              <p className="text-[34px] font-extrabold text-navy tracking-[-.035em] leading-none mt-2 tnum">
                {mdDateBig}
              </p>
              <p className="text-sm text-ink-soft mt-1.5">{mdWeekday}, 07:30 – 12:30</p>
              <span className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-full bg-teal-tint text-teal-deep text-xs font-bold">
                <CalendarClock size={13} aria-hidden="true" />
                {mdDaysLabel}
              </span>

              <div className="mt-5 pt-4 border-t border-line">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[.08em] text-ink-soft">
                    Stallholders at risk
                  </p>
                  <p className={`text-xl font-extrabold tnum ${atRiskCount > 0 ? 'text-alert' : 'text-navy'}`}>
                    {atRiskCount}
                  </p>
                </div>
                <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
                  {atRiskCount > 0
                    ? 'No attendance across the current window — each needs a decision.'
                    : 'Every active stallholder has attended within the window.'}
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* ── Today's confirmed bookings ───────────────────────────────────────
          Same access rule as the band: a role that cannot open Table Bookings
          should not read guest names and party sizes here either. */}
      {canSeeBookings && (
        <Card>
          <CardHeader
            title="Today's confirmed bookings"
            action={
              <button
                type="button"
                onClick={() => navigate('/table-bookings')}
                className="text-xs font-bold text-teal hover:text-teal-deep wl-transition"
              >
                {bookings.length > 0
                  ? `${bookings.length} booking${bookings.length !== 1 ? 's' : ''} →`
                  : 'Open →'}
              </button>
            }
          />
          {bookings.length === 0 ? (
            <EmptyState
              Icon={CalendarClock}
              title="No bookings for today"
              body="New reservations will appear here as they are confirmed."
            />
          ) : (
            <TableWrap className="border-0 rounded-none rounded-b-xl">
              <table className="w-full">
                <Thead>
                  <tr>
                    <Th>Time</Th>
                    <Th>Guest</Th>
                    <Th>Party</Th>
                    <Th>Table</Th>
                    <Th>Status</Th>
                  </tr>
                </Thead>
                <tbody>
                  {bookings.map(b => (
                    <tr key={b.id} className="border-t border-line hover:bg-gray-50 wl-transition">
                      <Td>{fmtTime(b.booking_time)}</Td>
                      <TdBold>{b.guest_name}</TdBold>
                      <Td>{b.party_size}</Td>
                      <Td>
                        {b.tables
                          ? `${b.tables.table_number}${b.tables.location ? ` · ${b.tables.location}` : ''}`
                          : '—'}
                      </Td>
                      <td className="px-4 py-3"><Badge tone="brand">Confirmed</Badge></td>
                    </tr>
                  ))}
                  {bookings.length === 0 && (
                    <EmptyRow
                      cols={5}
                      msg="No tables booked for today. New reservations appear here as soon as they are taken in Table Bookings."
                    />
                  )}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      )}

    </div>
  )
}
