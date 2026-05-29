import { useState, useEffect } from 'react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, fieldCls, Toast, useFlash } from '../admin/AdminUI'
import { TB_MANAGE_ROLES, fmtDate, fmtTime, todayStr, StatusBadge } from './TableBookingsUI'

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function UpcomingTab() {
  const { profile, session } = useAuth()
  const canManage = TB_MANAGE_ROLES.includes(profile?.role)

  const [bookings,   setBookings]   = useState([])
  const [tables,     setTables]     = useState([])
  const [userMap,    setUserMap]    = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [editModal,  setEditModal]  = useState(null)
  const [editForm,   setEditForm]   = useState({})
  const [editBusy,   setEditBusy]   = useState(false)
  const [toast,      setToast]      = useState(null)
  const flash = useFlash(setToast)

  const today = todayStr()
  const end7  = addDays(today, 6)

  async function load() {
    const [bookingsR, tablesR, profilesR] = await Promise.all([
      supabaseAdmin.from('table_bookings')
        .select('*, tables(table_number, capacity, location)')
        .gte('booking_date', today)
        .lte('booking_date', end7)
        .order('booking_date')
        .order('booking_time'),
      supabaseAdmin.from('tables')
        .select('id, table_number, capacity, location')
        .eq('is_active', true)
        .order('table_number'),
      supabaseAdmin.from('user_profiles').select('id, full_name'),
    ])
    setBookings(bookingsR.data ?? [])
    setTables(tablesR.data ?? [])
    const map = {}
    for (const u of (profilesR.data ?? [])) map[u.id] = u.full_name
    setUserMap(map)
  }

  useEffect(() => { load() }, [])

  // Group bookings by date
  const groups = bookings.reduce((acc, b) => {
    const grp = acc.find(g => g.date === b.booking_date)
    if (grp) grp.bookings.push(b)
    else acc.push({ date: b.booking_date, bookings: [b] })
    return acc
  }, [])

  function openEdit(booking) {
    setEditForm({
      guest_name:       booking.guest_name,
      guest_phone:      booking.guest_phone,
      party_size:       String(booking.party_size),
      booking_date:     booking.booking_date,
      booking_time:     fmtTime(booking.booking_time),
      table_id:         booking.table_id ?? '',
      special_requests: booking.special_requests ?? '',
      notes:            booking.notes ?? '',
    })
    setEditModal(booking)
  }

  async function handleEdit(e) {
    e.preventDefault()
    setEditBusy(true)
    try {
      const { error } = await supabaseAdmin.from('table_bookings').update({
        guest_name:       editForm.guest_name,
        guest_phone:      editForm.guest_phone,
        party_size:       Number(editForm.party_size),
        booking_date:     editForm.booking_date,
        booking_time:     editForm.booking_time,
        table_id:         editForm.table_id || null,
        special_requests: editForm.special_requests || null,
        notes:            editForm.notes || null,
        updated_at:       new Date().toISOString(),
      }).eq('id', editModal.id)
      if (error) throw error
      flash('Booking updated')
      setEditModal(null)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setEditBusy(false) }
  }

  const editTables = tables.filter(t => t.capacity >= Number(editForm.party_size || 1))

  return (
    <div className="p-6">
      <Toast toast={toast} />
      <h2 className="text-base font-semibold text-gray-800 mb-5">Next 7 Days</h2>

      {groups.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">No upcoming bookings</p>
      )}

      <div className="space-y-6">
        {groups.map(grp => {
          const totalCovers = grp.bookings.reduce((s, b) => s + b.party_size, 0)
          return (
            <div key={grp.date}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-sm font-semibold text-gray-700">{fmtDate(grp.date)}</h3>
                <span className="text-xs text-gray-400">
                  {grp.bookings.length} booking{grp.bookings.length !== 1 ? 's' : ''}
                  {' · '}
                  {totalCovers} cover{totalCovers !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                {grp.bookings.map((b, i) => (
                  <div key={b.id}>
                    {/* Compact row — click to expand */}
                    <button
                      onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-gray-50 ${
                        i > 0 ? 'border-t border-gray-100' : ''
                      } ${expandedId === b.id ? 'bg-gray-50' : ''}`}
                    >
                      <span className="text-xs font-mono text-gray-500 w-12 shrink-0">{fmtTime(b.booking_time)}</span>
                      <span className="text-sm font-medium text-gray-900 flex-1 truncate text-left">{b.guest_name}</span>
                      <span className="text-xs text-gray-500 shrink-0">{b.party_size} pax</span>
                      <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">{b.tables?.table_number ?? '—'}</span>
                      <StatusBadge status={b.status} />
                      <span className={`text-gray-300 text-xs shrink-0 transition-transform duration-150 ${expandedId === b.id ? 'rotate-180' : ''}`}>▼</span>
                    </button>

                    {/* Expanded detail */}
                    {expandedId === b.id && (
                      <div className="border-t border-gray-100 bg-blue-50/30 px-4 py-4">
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
                          <div>
                            <dt className="text-xs text-gray-500 mb-0.5">Guest</dt>
                            <dd className="font-medium text-gray-900">{b.guest_name}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-gray-500 mb-0.5">Phone</dt>
                            <dd className="text-gray-700">{b.guest_phone}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-gray-500 mb-0.5">Party Size</dt>
                            <dd className="text-gray-700">{b.party_size} guests</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-gray-500 mb-0.5">Table</dt>
                            <dd className="text-gray-700">
                              {b.tables
                                ? `${b.tables.table_number} · ${b.tables.location} · ${b.tables.capacity} seats`
                                : '—'}
                            </dd>
                          </div>
                          {b.guest_email && (
                            <div>
                              <dt className="text-xs text-gray-500 mb-0.5">Email</dt>
                              <dd className="text-gray-700">{b.guest_email}</dd>
                            </div>
                          )}
                          {b.special_requests && (
                            <div className="col-span-2">
                              <dt className="text-xs text-gray-500 mb-0.5">Special Requests</dt>
                              <dd className="text-gray-700">{b.special_requests}</dd>
                            </div>
                          )}
                          {b.notes && (
                            <div className="col-span-2">
                              <dt className="text-xs text-gray-500 mb-0.5">Notes</dt>
                              <dd className="text-gray-700">{b.notes}</dd>
                            </div>
                          )}
                          {b.created_by && (
                            <div>
                              <dt className="text-xs text-gray-500 mb-0.5">Created By</dt>
                              <dd className="text-gray-700">{userMap[b.created_by] ?? '—'}</dd>
                            </div>
                          )}
                        </dl>
                        {canManage && (
                          <button
                            onClick={() => openEdit(b)}
                            className="text-xs font-medium px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors"
                          >
                            Edit Booking
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Edit modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-gray-900">Edit Booking</h4>
              <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Guest Name *">
                  <Inp required value={editForm.guest_name}
                    onChange={e => setEditForm(p => ({ ...p, guest_name: e.target.value }))} />
                </Field>
                <Field label="Phone *">
                  <div className="flex items-center border border-gray-300 rounded-lg px-2 bg-white focus-within:ring-2 focus-within:ring-green-600">
                    <PhoneInput international defaultCountry="MW"
                      value={editForm.guest_phone}
                      onChange={val => setEditForm(p => ({ ...p, guest_phone: val ?? '' }))}
                      inputClassName="flex-1 py-2 px-1 text-sm outline-none border-none bg-transparent min-w-0" />
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Date *">
                  <Inp type="date" required value={editForm.booking_date}
                    onChange={e => setEditForm(p => ({ ...p, booking_date: e.target.value }))} />
                </Field>
                <Field label="Time *">
                  <Inp type="time" required value={editForm.booking_time}
                    onChange={e => setEditForm(p => ({ ...p, booking_time: e.target.value }))} />
                </Field>
                <Field label="Party Size *">
                  <Inp type="number" required min="1" value={editForm.party_size}
                    onChange={e => setEditForm(p => ({ ...p, party_size: e.target.value }))} />
                </Field>
              </div>
              <Field label="Table">
                <Sel value={editForm.table_id}
                  onChange={e => setEditForm(p => ({ ...p, table_id: e.target.value }))}>
                  <option value="">No table assigned</option>
                  {editTables.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.table_number} · {t.location} · {t.capacity} seats
                    </option>
                  ))}
                </Sel>
              </Field>
              <Field label="Special Requests">
                <textarea rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                  value={editForm.special_requests}
                  onChange={e => setEditForm(p => ({ ...p, special_requests: e.target.value }))} />
              </Field>
              <Field label="Notes">
                <textarea rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                  value={editForm.notes}
                  onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
              </Field>
              <div className="flex gap-3">
                <button type="submit" disabled={editBusy}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
                  {editBusy ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setEditModal(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
