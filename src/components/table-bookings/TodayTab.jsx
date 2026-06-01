import { useState, useEffect } from 'react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Th, Td, Toast, useFlash } from '../admin/AdminUI'
import {
  TB_MANAGE_ROLES, STATUS_CFG, fmtDate, fmtTime,
  todayStr, currentTimeStr, isPotentialNoShow, StatusBadge,
} from './TableBookingsUI'

export default function TodayTab() {
  const { profile, session } = useAuth()
  const canManage  = TB_MANAGE_ROLES.includes(profile?.role)
  const canCheckIn = canManage

  const [date,         setDate]         = useState(todayStr)
  const [bookings,     setBookings]     = useState([])
  const [tables,       setTables]       = useState([])
  const [walkIn,       setWalkIn]       = useState(false)
  const [walkInForm,   setWalkInForm]   = useState({ guest_name: '', guest_phone: '', party_size: '2', table_id: '' })
  const [walkInBusy,   setWalkInBusy]   = useState(false)
  const [toast,        setToast]        = useState(null)
  const flash = useFlash(setToast)

  async function load() {
    const [bookingsR, tablesR] = await Promise.all([
      supabaseAdmin.from('table_bookings')
        .select('*, tables(table_number, capacity, location)')
        .eq('booking_date', date)
        .order('booking_time'),
      supabaseAdmin.from('tables')
        .select('id, table_number, capacity, location')
        .eq('is_active', true)
        .order('table_number'),
    ])
    setBookings(bookingsR.data ?? [])
    setTables(tablesR.data ?? [])
  }

  useEffect(() => { load() }, [date])

  async function updateStatus(bookingId, newStatus) {
    try {
      const { error } = await supabaseAdmin.from('table_bookings')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', bookingId)
      if (error) throw error
      flash(`Marked as ${STATUS_CFG[newStatus]?.label ?? newStatus}`)
      load()
    } catch (err) { flash(err.message, false) }
  }

  async function handleWalkIn(e) {
    e.preventDefault()
    setWalkInBusy(true)
    try {
      const { error } = await supabaseAdmin.from('table_bookings').insert({
        guest_name:   walkInForm.guest_name,
        guest_phone:  walkInForm.guest_phone,
        party_size:   Number(walkInForm.party_size),
        booking_date: date,
        booking_time: currentTimeStr(),
        table_id:     walkInForm.table_id || null,
        status:       'seated',
        created_by:   session?.user?.id ?? null,
      })
      if (error) throw error
      flash('Walk-in seated')
      setWalkIn(false)
      setWalkInForm({ guest_name: '', guest_phone: '', party_size: '2', table_id: '' })
      load()
    } catch (err) { flash(err.message, false) }
    finally { setWalkInBusy(false) }
  }

  // Summary
  const totalCovers    = bookings.reduce((s, b) => s + b.party_size, 0)
  const countOf        = s => bookings.filter(b => b.status === s).length
  const colSpan        = canManage ? 6 : 5

  // Walk-in table options filtered by party size
  const walkInTables = tables.filter(t => t.capacity >= Number(walkInForm.party_size || 1))

  return (
    <div className="p-6">
      <Toast toast={toast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Date</label>
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
        </div>
        {canManage && (
          <button
            onClick={() => setWalkIn(true)}
            className="ml-auto bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            + Walk In
          </button>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500 mb-0.5">Total Covers</p>
          <p className="text-xl font-bold text-gray-900">{totalCovers}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
          <p className="text-xs text-blue-700 mb-0.5">Confirmed</p>
          <p className="text-xl font-bold text-blue-800">{countOf('confirmed')}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-3">
          <p className="text-xs text-green-700 mb-0.5">Seated</p>
          <p className="text-xl font-bold text-green-800">{countOf('seated')}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500 mb-0.5">Completed</p>
          <p className="text-xl font-bold text-gray-700">{countOf('completed')}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
          <p className="text-xs text-red-700 mb-0.5">Cancelled</p>
          <p className="text-xl font-bold text-red-800">{countOf('cancelled')}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
          <p className="text-xs text-amber-700 mb-0.5">No Shows</p>
          <p className="text-xl font-bold text-amber-800">{countOf('no_show')}</p>
        </div>
      </div>

      {/* Bookings table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Time</Th>
              <Th>Guest Name</Th>
              <Th>Party Size</Th>
              <Th>Table</Th>
              <Th>Status</Th>
              {canManage && <Th>Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {bookings.map(b => {
              const noShowRisk = isPotentialNoShow(b)
              return (
                <tr key={b.id} className={`border-b border-gray-100 transition-colors ${
                  noShowRisk ? 'bg-amber-50/70' : 'hover:bg-gray-50'
                }`}>
                  <td className="px-4 py-3 text-sm">
                    <span className={noShowRisk ? 'font-semibold text-amber-700' : 'text-gray-600'}>
                      {fmtTime(b.booking_time)}
                    </span>
                    {noShowRisk && (
                      <span className="ml-1.5 text-xs text-amber-500" title="Confirmed 45+ min ago — possible no-show">⚠</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {b.guest_name}
                    {b.special_requests && (
                      <span className="ml-1.5 text-blue-400 cursor-help text-xs" title={b.special_requests}>📋</span>
                    )}
                  </td>
                  <Td>{b.party_size}</Td>
                  <Td>{b.tables?.table_number ?? '—'}{b.tables?.location ? ` · ${b.tables.location}` : ''}</Td>
                  <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {b.status === 'pending' && (
                          <>
                            <button
                              onClick={() => updateStatus(b.id, 'confirmed')}
                              className="text-xs font-medium px-2.5 py-1 bg-brand-teal hover:bg-brand-teal-dark text-white rounded-lg transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => updateStatus(b.id, 'cancelled')}
                              className="text-xs font-medium px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {b.status === 'confirmed' && (
                          <>
                            <button
                              onClick={() => updateStatus(b.id, 'seated')}
                              className="text-xs font-medium px-2.5 py-1 bg-brand-teal hover:bg-brand-teal-dark text-white rounded-lg transition-colors"
                            >
                              Seat
                            </button>
                            <button
                              onClick={() => updateStatus(b.id, 'no_show')}
                              className="text-xs font-medium px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg transition-colors"
                            >
                              No Show
                            </button>
                            <button
                              onClick={() => updateStatus(b.id, 'cancelled')}
                              className="text-xs font-medium px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {b.status === 'seated' && (
                          <button
                            onClick={() => updateStatus(b.id, 'completed')}
                            className="text-xs font-medium px-2.5 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
            {bookings.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-gray-400">
                  No bookings for {fmtDate(date)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Walk-in modal */}
      {walkIn && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-base font-semibold text-gray-900">Walk-in Guest</h4>
              <button onClick={() => setWalkIn(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Status set to Seated immediately.</p>
            <form onSubmit={handleWalkIn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name *</label>
                <input
                  required type="text" value={walkInForm.guest_name}
                  onChange={e => setWalkInForm(p => ({ ...p, guest_name: e.target.value }))}
                  placeholder="Full name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <div className="flex items-center border border-gray-300 rounded-lg px-2 bg-white focus-within:ring-2 focus-within:ring-brand-teal">
                  <PhoneInput
                    international defaultCountry="MW"
                    value={walkInForm.guest_phone}
                    onChange={val => setWalkInForm(p => ({ ...p, guest_phone: val ?? '' }))}
                    inputClassName="flex-1 py-2 px-1 text-sm outline-none border-none bg-transparent min-w-0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Party Size *</label>
                  <input
                    required type="number" min="1" value={walkInForm.party_size}
                    onChange={e => setWalkInForm(p => ({ ...p, party_size: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Table</label>
                  <select
                    value={walkInForm.table_id}
                    onChange={e => setWalkInForm(p => ({ ...p, table_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  >
                    <option value="">No table</option>
                    {walkInTables.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.table_number} · {t.location} · {t.capacity}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="submit" disabled={walkInBusy}
                  className="flex-1 bg-brand-teal hover:bg-brand-teal-dark text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
                >
                  {walkInBusy ? 'Seating…' : 'Seat Guest'}
                </button>
                <button
                  type="button" onClick={() => setWalkIn(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors"
                >
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
