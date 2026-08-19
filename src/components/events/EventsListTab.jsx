import { useState, useEffect } from 'react'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, fieldCls, Th, Td, Toast, useFlash } from '../admin/AdminUI'
import { MANAGE_ROLES } from '../../lib/roles'
import {
  EVENT_TYPES, VENUES,   // EVENT_STATUSES dropped with the Edit modal's Status control (C-10/D-4)
  fmtDate, fmtTime, fmtMWK,
  EventStatusBadge, EmptyRow, todayStr,
  useRevenueReading, RevenueReadingPicker,
} from './EventsUI'
import { computePortfolioRevenue, REVENUE_READINGS } from '../../lib/revenue'

function parseEventDate(val) {
  if (!val) return null
  if (val instanceof Date) return new Date(val.getFullYear(), val.getMonth(), val.getDate(), 12, 0, 0)
  const s = String(val).slice(0, 10)
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 12, 0, 0)
}

const STATUS_FILTERS = [
  { value: 'all',         label: 'All'         },
  { value: 'enquiry',     label: 'Enquiry'     },
  { value: 'confirmed',   label: 'Confirmed'   },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed'   },
  { value: 'cancelled',   label: 'Cancelled'   },
]

function rowHighlight(ev) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const evDate    = parseEventDate(ev.event_date)
  const daysUntil = evDate ? (evDate - today) / 86400000 : -1
  const soonAlert    = daysUntil >= 0 && daysUntil <= 7 && ev.status !== 'cancelled'
  const depositAlert = ev.status === 'confirmed' && !ev.deposit_paid
  return soonAlert || depositAlert
    ? 'bg-amber-50 border-b border-amber-100 hover:bg-amber-100'
    : 'border-b border-gray-100 hover:bg-gray-50'
}

function applySort(events, sortBy) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const arr = [...events]

  if (sortBy === 'date') {
    return arr.sort((a, b) => {
      const da = parseEventDate(a.event_date)
      const db = parseEventDate(b.event_date)
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      const aFut = da >= today
      const bFut = db >= today
      if (aFut !== bFut) return aFut ? -1 : 1
      const dir = aFut ? 1 : -1
      if (da.getTime() !== db.getTime()) return (da - db) * dir
      // Same date: confirmed+unpaid deposit floats up
      const ap = a.status === 'confirmed' && !a.deposit_paid
      const bp = b.status === 'confirmed' && !b.deposit_paid
      return ap === bp ? 0 : ap ? -1 : 1
    })
  }

  if (sortBy === 'deposit') {
    return arr.sort((a, b) => {
      if (a.deposit_paid !== b.deposit_paid) return a.deposit_paid ? 1 : -1
      const da = parseEventDate(a.event_date)
      const db = parseEventDate(b.event_date)
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return da - db
    })
  }

  if (sortBy === 'guests') {
    return arr.sort((a, b) => (b.guest_count ?? 0) - (a.guest_count ?? 0))
  }

  return arr
}

const BLANK_EDIT = {
  name: '', event_type: 'wedding', event_date: '', start_time: '', end_time: '',
  guest_count: '', venue_area: '', organiser_name: '', organiser_contact: '',
  organiser_email: '',
  // No deposit_paid / status here either -- the Edit modal no longer offers
  // them, and a default the form cannot reach is just a trap for the next
  // reader (C-10/C-11, D-4).
  special_requirements: '', notes: '',
}

export default function EventsListTab({ onView }) {
  const { profile } = useAuth()
  const canManage = MANAGE_ROLES.includes(profile?.role)

  const [events,    setEvents]    = useState([])
  const [loading,   setLoading]   = useState(true)

  // Revenue inputs. Loaded whole rather than per event: all three tables are
  // small (5 payments, 4 bill items, 2 allocations as of 18 Aug 2026) and
  // computePortfolioRevenue buckets by event id itself. No cost source is
  // loaded — see the note in EventRevenueSection.
  const [reading,   setReading]   = useRevenueReading()
  const [payments,  setPayments]  = useState([])
  const [billItems, setBillItems] = useState([])
  const [allocs,    setAllocs]    = useState([])
  const [toast,     setToast]     = useState(null)
  const flash = useFlash(setToast)

  // Filters & sort
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [depositFilter, setDepositFilter] = useState('all')
  const [sortBy,        setSortBy]        = useState('date')

  // Edit modal
  const [editEvent, setEditEvent] = useState(null)
  const [editForm,  setEditForm]  = useState(BLANK_EDIT)
  const [editBusy,  setEditBusy]  = useState(false)

  // Delete confirm
  const [deleteId, setDeleteId] = useState(null)
  const [delBusy,  setDelBusy]  = useState(false)

  async function load() {
    setLoading(true)
    const [evR, payR, billR, allocR] = await Promise.all([
      supabase.from('events').select('*, event_checklists(id, is_complete)'),
      supabase.from('event_payments').select('event_id, amount, payment_type'),
      supabase.from('event_bill_items').select('event_id, category, amount'),
      supabase.from('event_stock_allocations')
        .select('event_id, stock_item_id, deducted_qty, returned_qty'),
    ])
    setEvents(evR.data ?? [])
    setPayments(payR.data ?? [])
    setBillItems(billR.data ?? [])
    setAllocs(allocR.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Summary stats (computed from raw events before any filter) ──
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59)
  const next7      = new Date(today.getTime() + 7 * 86400000)

  const monthEvents = events.filter(ev => {
    const d = parseEventDate(ev.event_date)
    return d && d >= monthStart && d <= monthEnd && ev.status !== 'cancelled'
  })
  const totalThisMonth = monthEvents.length

  // Revenue over THIS MONTH's events, under the selected reading. Cancelled
  // events are already excluded by monthEvents — a cancelled booking's deposit
  // is a real receipt, but it is not this month's trading, and mixing the two
  // is the kind of ambiguity the reading toggle exists to expose rather than
  // bury.
  const revenue = computePortfolioRevenue(reading, {
    events: monthEvents, payments, billItems, allocations: allocs,
  })
  const revenueCfg = REVENUE_READINGS.find(r => r.value === revenue.reading)

  const confirmedUnpaid = events.filter(ev =>
    ev.status === 'confirmed' && !ev.deposit_paid
  ).length

  const inNext7Days = events.filter(ev => {
    const d = parseEventDate(ev.event_date)
    return d && d >= today && d <= next7 && ev.status !== 'cancelled'
  }).length

  // ── Filter + sort ───────────────────────────────────────────────
  let displayed = events
  if (statusFilter !== 'all')  displayed = displayed.filter(e => e.status === statusFilter)
  if (depositFilter === 'paid')   displayed = displayed.filter(e => e.deposit_paid)
  if (depositFilter === 'unpaid') displayed = displayed.filter(e => !e.deposit_paid)
  displayed = applySort(displayed, sortBy)

  // ── Edit handlers ───────────────────────────────────────────────
  function openEdit(ev) {
    setEditForm({
      name:                 ev.name,
      event_type:           ev.event_type,
      event_date:           ev.event_date,
      start_time:           ev.start_time ?? '',
      end_time:             ev.end_time ?? '',
      guest_count:          ev.guest_count ?? '',
      venue_area:           ev.venue_area ?? '',
      organiser_name:       ev.organiser_name ?? '',
      organiser_contact:    ev.organiser_contact ?? '',
      organiser_email:      ev.organiser_email ?? '',
      // `status` and `deposit_paid` are deliberately NOT in this form.
      // AUDIT_3 C-10/C-11, decision D-4: status belongs to the detail view's
      // changeStatus(), which also deducts/returns stock and generates the BEO;
      // deposit_paid is maintained by Add Payment and recomputed by
      // reverse_event_payment() (062). Hand-setting either here bypassed all of
      // it, so the controls are gone rather than merely discouraged.
      special_requirements: ev.special_requirements ?? '',
      notes:                ev.notes ?? '',
    })
    setEditEvent(ev)
  }

  async function handleEdit(e) {
    e.preventDefault()
    setEditBusy(true)
    try {
      const { error } = await supabase.from('events').update({
        name:                 editForm.name,
        event_type:           editForm.event_type,
        event_date:           editForm.event_date,
        start_time:           editForm.start_time || null,
        end_time:             editForm.end_time || null,
        guest_count:          editForm.guest_count ? Number(editForm.guest_count) : null,
        venue_area:           editForm.venue_area || null,
        organiser_name:       editForm.organiser_name || null,
        organiser_contact:    editForm.organiser_contact || null,
        organiser_email:      editForm.organiser_email || null,
        // No `status`, no `deposit_paid` -- see openEdit above (C-10/C-11, D-4).
        special_requirements: editForm.special_requirements || null,
        notes:                editForm.notes || null,
        updated_at:           new Date().toISOString(),
      }).eq('id', editEvent.id)
      if (error) throw error
      flash('Event updated')
      setEditEvent(null)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setEditBusy(false) }
  }

  async function handleDelete() {
    setDelBusy(true)
    try {
      const { error } = await supabase.from('events').delete().eq('id', deleteId)
      if (error) throw error
      flash('Event deleted')
      setDeleteId(null)
      load()
    } catch (err) {
      // C-37 / D-3: the only expected failure is the event_payments foreign key
      // (NO ACTION), which arrives as a raw Postgres constraint string. Say what
      // it means; anything else still surfaces verbatim rather than being hidden.
      const fkBlocked = err?.code === '23503' || /foreign key|violates/i.test(err?.message ?? '')
      flash(
        fkBlocked
          ? 'This event has payments recorded against it and cannot be deleted — the money history has to survive. Cancel the event from its own page instead.'
          : err.message,
        false,
      )
    }
    finally { setDelBusy(false) }
  }

  return (
    <div>
      <Toast toast={toast} />

      {/* Summary strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border-b border-gray-200">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Events This Month</p>
          <p className="text-2xl font-bold text-gray-900">{totalThisMonth}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-xs text-amber-600 mb-1">Confirmed · Unpaid Deposit</p>
          <p className="text-2xl font-bold text-amber-700">{confirmedUnpaid}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-600 mb-1">Events in Next 7 Days</p>
          <p className="text-2xl font-bold text-blue-700">{inNext7Days}</p>
        </div>

        {/* Revenue — provisional reading, see EventRevenueSection for the full
            panel and the on-screen warning. */}
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-xs text-gray-500">Revenue · This Month</p>
            <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded whitespace-nowrap">
              Provisional
            </span>
          </div>
          {revenue.available
            ? <p className="text-2xl font-bold text-gray-900">{fmtMWK(revenue.headline)}</p>
            : <p className="text-2xl font-bold text-gray-300" title={revenue.detail.reason}>—</p>
          }
          <p className="text-[11px] text-gray-400 mt-0.5">{revenueCfg?.label}</p>
          <div className="mt-2">
            <RevenueReadingPicker reading={revenue.reading} onChange={setReading} size="sm" />
          </div>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-0 overflow-x-auto border-b border-gray-200 px-4 pt-3">
        {STATUS_FILTERS.map(f => (
          <button key={f.value} onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              statusFilter === f.value
                ? 'border-brand-teal text-brand-teal'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Filter + sort controls */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 whitespace-nowrap">Deposit</span>
          <select
            value={depositFilter}
            onChange={e => setDepositFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-teal">
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 whitespace-nowrap">Sort by</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-teal">
            <option value="date">Date</option>
            <option value="deposit">Deposit Status</option>
            <option value="guests">Guest Count</option>
          </select>
        </div>
        <span className="text-xs text-gray-400 ml-auto">
          {displayed.length} event{displayed.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Event Name</Th>
              <Th>Type</Th>
              <Th>Date</Th>
              <Th>Time</Th>
              <Th>Guests</Th>
              <Th>Venue</Th>
              <Th>Deposit</Th>
              <Th>Checklist</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(ev => {
              const cl   = ev.event_checklists ?? []
              const done = cl.filter(c => c.is_complete).length
              const time = [fmtTime(ev.start_time), fmtTime(ev.end_time)].filter(Boolean).join('–') || '—'
              const typeName = EVENT_TYPES.find(t => t.value === ev.event_type)?.label ?? ev.event_type
              return (
                <tr key={ev.id} className={rowHighlight(ev)}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{ev.name}</td>
                  <Td>{typeName}</Td>
                  <Td>{fmtDate(ev.event_date)}</Td>
                  <Td>{time}</Td>
                  <Td>{ev.guest_count ?? '—'}</Td>
                  <Td>{ev.venue_area ?? '—'}</Td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      ev.deposit_paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {ev.deposit_paid ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {cl.length > 0 ? `${done}/${cl.length}` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3"><EventStatusBadge status={ev.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <button onClick={() => onView(ev.id)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                        <Eye size={13} /> View
                      </button>
                      {canManage && (
                        <>
                          <button onClick={() => openEdit(ev)}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                            <Pencil size={13} /> Edit
                          </button>
                          <button onClick={() => setDeleteId(ev.id)}
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                            <Trash2 size={13} /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {displayed.length === 0 && !loading && <EmptyRow cols={10} />}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditEvent(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-900">Edit Event</h3>
              <button onClick={() => setEditEvent(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Event Name *">
                  <Inp required value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </Field>
                <Field label="Event Type *">
                  <Sel required value={editForm.event_type}
                    onChange={e => setEditForm(f => ({ ...f, event_type: e.target.value }))}>
                    {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Sel>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Event Date *">
                  <Inp type="date" required value={editForm.event_date}
                    onChange={e => setEditForm(f => ({ ...f, event_date: e.target.value }))} />
                </Field>
                <Field label="Start Time">
                  <Inp type="time" value={editForm.start_time}
                    onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))} />
                </Field>
                <Field label="End Time">
                  <Inp type="time" value={editForm.end_time}
                    onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Guest Count">
                  <Inp type="number" min="0" value={editForm.guest_count}
                    onChange={e => setEditForm(f => ({ ...f, guest_count: e.target.value }))} />
                </Field>
                <Field label="Venue Area">
                  <Sel value={editForm.venue_area}
                    onChange={e => setEditForm(f => ({ ...f, venue_area: e.target.value }))}>
                    <option value="">Select venue area…</option>
                    {VENUES.map(v => <option key={v} value={v}>{v}</option>)}
                  </Sel>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Organiser Name">
                  <Inp value={editForm.organiser_name}
                    onChange={e => setEditForm(f => ({ ...f, organiser_name: e.target.value }))} />
                </Field>
                <Field label="Organiser Contact">
                  <Inp type="tel" value={editForm.organiser_contact}
                    onChange={e => setEditForm(f => ({ ...f, organiser_contact: e.target.value }))} />
                </Field>
                <Field label="Organiser Email">
                  <Inp type="email" value={editForm.organiser_email}
                    onChange={e => setEditForm(f => ({ ...f, organiser_email: e.target.value }))} />
                </Field>
              </div>
              {/* Status and Deposit Paid used to be edited here. Removed:
                  C-10/C-11, decision D-4. Status is changed from the event's
                  detail view (which deducts or returns stock and builds the
                  BEO); the deposit follows the payment ledger. */}
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                Status is changed from the event's own page, so stock and the run
                sheet stay in step. The deposit follows the payments recorded
                against the event.
              </p>
              <Field label="Special Requirements">
                <textarea rows={2} className={`${fieldCls} resize-none`} value={editForm.special_requirements}
                  onChange={e => setEditForm(f => ({ ...f, special_requirements: e.target.value }))} />
              </Field>
              <Field label="Notes">
                <textarea rows={2} className={`${fieldCls} resize-none`} value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
              </Field>
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setEditEvent(null)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={editBusy}
                  className="px-4 py-2 text-sm font-medium bg-brand-teal hover:bg-brand-teal-dark text-white rounded-lg disabled:opacity-60">
                  {editBusy ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Event?</h3>
            <p className="text-sm text-gray-500 mb-5">
              {/* C-37 / D-3: event_payments.event_id is ON DELETE NO ACTION, so
                  the database refuses this outright once money is recorded.
                  That block is deliberate -- payment history must survive -- so
                  the text says so instead of promising the payments away. */}
              This permanently deletes the event along with its checklists, stock
              allocations and bill items. An event that already has payments
              recorded against it cannot be deleted, so the money history is
              never lost — cancel it from its own page instead.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={delBusy}
                className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-60">
                {delBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
