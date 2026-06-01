import { useState, useEffect } from 'react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Th, Td, Toast, useFlash, Field, Inp, Sel, fieldCls } from '../admin/AdminUI'
import { TB_MANAGE_ROLES, BOOKING_STATUSES, STATUS_CFG, fmtDate, fmtTime, StatusBadge } from './TableBookingsUI'

export default function AllBookingsTab() {
  const { profile, session } = useAuth()
  const canManage = TB_MANAGE_ROLES.includes(profile?.role)

  const [bookings,       setBookings]       = useState([])
  const [tables,         setTables]         = useState([])
  const [userMap,        setUserMap]        = useState({})
  const [search,         setSearch]         = useState('')
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterFrom,     setFilterFrom]     = useState('')
  const [filterTo,       setFilterTo]       = useState('')
  const [editModal,      setEditModal]      = useState(null)
  const [editForm,       setEditForm]       = useState({})
  const [editBusy,       setEditBusy]       = useState(false)
  const [cancelConfirm,  setCancelConfirm]  = useState(null)
  const [toast,          setToast]          = useState(null)
  const flash = useFlash(setToast)

  async function load() {
    const [bookingsR, tablesR, profilesR] = await Promise.all([
      supabaseAdmin.from('table_bookings')
        .select('*, tables(table_number, capacity, location)')
        .order('booking_date', { ascending: false })
        .order('booking_time', { ascending: false }),
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

  // Client-side filters
  const filtered = bookings.filter(b => {
    if (search) {
      const q = search.toLowerCase()
      if (!b.guest_name.toLowerCase().includes(q) && !(b.guest_phone ?? '').toLowerCase().includes(q)) return false
    }
    if (filterStatus && b.status !== filterStatus)  return false
    if (filterFrom   && b.booking_date < filterFrom) return false
    if (filterTo     && b.booking_date > filterTo)   return false
    return true
  })

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

  async function handleCancel() {
    const id   = cancelConfirm.id
    const name = cancelConfirm.guest_name
    setCancelConfirm(null)
    try {
      const { error } = await supabaseAdmin.from('table_bookings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      flash(`${name}'s booking cancelled`)
      load()
    } catch (err) { flash(err.message, false) }
  }

  const editTables = tables.filter(t => t.capacity >= Number(editForm.party_size || 1))
  const colSpan    = canManage ? 8 : 7

  return (
    <div className="p-6">
      <Toast toast={toast} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Guest name or phone…"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal w-52"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal">
            <option value="">All statuses</option>
            {BOOKING_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CFG[s].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
        {(search || filterStatus || filterFrom || filterTo) && (
          <button
            onClick={() => { setSearch(''); setFilterStatus(''); setFilterFrom(''); setFilterTo('') }}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded-lg"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-gray-400 self-end pb-1.5 ml-auto">
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Date</Th>
              <Th>Time</Th>
              <Th>Guest</Th>
              <Th>Party</Th>
              <Th>Table</Th>
              <Th>Status</Th>
              <Th>Created By</Th>
              {canManage && <Th>Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                <Td>{fmtDate(b.booking_date)}</Td>
                <Td>{fmtTime(b.booking_time)}</Td>
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">{b.guest_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{b.guest_phone}</p>
                </td>
                <Td>{b.party_size}</Td>
                <Td>{b.tables?.table_number ?? '—'}</Td>
                <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                <Td>{b.created_by ? (userMap[b.created_by] ?? '—') : null}</Td>
                {canManage && (
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        onClick={() => openEdit(b)}
                        className="text-xs font-medium px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      {b.status !== 'cancelled' && b.status !== 'completed' && (
                        <button
                          onClick={() => setCancelConfirm(b)}
                          className="text-xs font-medium px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-gray-400">
                  No bookings found
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
                  <div className="flex items-center border border-gray-300 rounded-lg px-2 bg-white focus-within:ring-2 focus-within:ring-brand-teal">
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none"
                  value={editForm.special_requests}
                  onChange={e => setEditForm(p => ({ ...p, special_requests: e.target.value }))} />
              </Field>
              <Field label="Notes">
                <textarea rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none"
                  value={editForm.notes}
                  onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
              </Field>
              <div className="flex gap-3">
                <button type="submit" disabled={editBusy}
                  className="flex-1 bg-brand-teal hover:bg-brand-teal-dark text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
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

      {/* Cancel confirmation */}
      {cancelConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h4 className="text-base font-semibold text-gray-900 mb-2">Cancel Booking?</h4>
            <p className="text-sm text-gray-600 mb-1">
              Cancel the booking for <span className="font-medium">{cancelConfirm.guest_name}</span>?
            </p>
            <p className="text-xs text-gray-400 mb-5">
              {fmtDate(cancelConfirm.booking_date)} at {fmtTime(cancelConfirm.booking_time)} · {cancelConfirm.party_size} guests
            </p>
            <div className="flex gap-3">
              <button onClick={handleCancel}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg text-sm transition-colors">
                Cancel Booking
              </button>
              <button onClick={() => setCancelConfirm(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors">
                Keep
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
