import { useState, useEffect } from 'react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Toast } from '../admin/AdminUI'
import { SectionHead, FormGrid } from '../ui/kit'
import { TB_MANAGE_ROLES } from '../../lib/roles'
import { todayStr, fmtTime, AccessDenied } from './TableBookingsUI'
import { fieldCls } from '../ui/kit.constants'
import { useFlash } from '../ui/useFlash'

const BLANK = {
  guest_name: '', guest_phone: '', guest_email: '',
  party_size: '2', booking_date: todayStr(), booking_time: '19:00',
  table_id: '', special_requests: '', notes: '',
}

export default function NewBookingTab() {
  const { profile, session } = useAuth()
  const canManage = TB_MANAGE_ROLES.includes(profile?.role)

  const [form,            setForm]            = useState(BLANK)
  const [tables,          setTables]          = useState([])
  const [conflictWarning, setConflictWarning] = useState('')
  const [busy,            setBusy]            = useState(false)
  const [toast,           setToast]           = useState(null)
  const flash = useFlash(setToast)

  async function checkConflict(tableId, bookingDate, bookingTime) {
    if (!tableId || !bookingDate || !bookingTime) {
      setConflictWarning('')
      return
    }
    const { data } = await supabase.from('table_bookings')
      .select('id, booking_time, tables(table_number)')
      .eq('table_id', tableId)
      .eq('booking_date', bookingDate)
      .in('status', ['confirmed', 'seated'])

    if (!data || data.length === 0) {
      setConflictWarning('')
      return
    }

    const [hh, mm] = bookingTime.split(':').map(Number)
    const newMins = hh * 60 + mm
    const conflict = data.find(b => {
      const [bh, bm] = String(b.booking_time).split(':').map(Number)
      return Math.abs(newMins - (bh * 60 + bm)) < 45
    })

    if (conflict) {
      const tableNum = conflict.tables?.table_number ?? ''
      setConflictWarning(
        `Table ${tableNum} already has a booking at ${fmtTime(conflict.booking_time)} — select another table or time`
      )
    } else {
      setConflictWarning('')
    }
  }

  useEffect(() => {
    supabase.from('tables')
      .select('id, table_number, capacity, location')
      .eq('is_active', true)
      .order('table_number')
      .then(({ data }) => setTables(data ?? []))
  }, [])

  useEffect(() => {
    checkConflict(form.table_id, form.booking_date, form.booking_time)
  }, [form.table_id, form.booking_date, form.booking_time])

  if (!canManage) return <AccessDenied />

  const eligibleTables = tables.filter(t => t.capacity >= Number(form.party_size || 1))

  function f(field) { return e => setForm(p => ({ ...p, [field]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    const partySize = Number(form.party_size)
    const selected  = tables.find(t => t.id === form.table_id)
    if (selected && partySize > selected.capacity) {
      flash(`Party size exceeds table capacity (${selected.capacity} seats)`, false)
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.from('table_bookings').insert({
        guest_name:       form.guest_name,
        guest_phone:      form.guest_phone,
        guest_email:      form.guest_email      || null,
        party_size:       partySize,
        booking_date:     form.booking_date,
        booking_time:     form.booking_time,
        table_id:         form.table_id         || null,
        special_requests: form.special_requests || null,
        notes:            form.notes            || null,
        status:           'pending',
        created_by:       session?.user?.id     ?? null,
      })
      if (error) throw error
      flash('Booking created')
      setForm({ ...BLANK, booking_date: form.booking_date })
      setConflictWarning('')
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  return (
    <div className="p-6">
      <Toast toast={toast} />
      <SectionHead
        title="New booking"
        subtitle="Takes a reservation for the restaurant. It is created as Pending and confirmed from the Today tab."
        className="mb-6"
      />
      <form onSubmit={handleSubmit} className="space-y-4 max-w-4xl">
        <FormGrid>
          <Field label="Guest Name *">
            <Inp required placeholder="Full name" value={form.guest_name} onChange={f('guest_name')} />
          </Field>
          <Field label="Email">
            <Inp type="email" placeholder="Optional" value={form.guest_email} onChange={f('guest_email')} />
          </Field>
        </FormGrid>

        <Field label="Phone *">
          <div className="flex items-center border border-gray-300 rounded-lg px-2 bg-white focus-within:ring-2 focus-within:ring-teal/25 focus-within:border-teal">
            <PhoneInput
              international defaultCountry="MW"
              value={form.guest_phone}
              onChange={val => setForm(p => ({ ...p, guest_phone: val ?? '' }))}
              inputClassName="flex-1 py-2 px-1 text-sm outline-none border-none bg-transparent min-w-0"
            />
          </div>
        </Field>

        <FormGrid cols={3}>
          <Field label="Date *">
            <Inp type="date" required value={form.booking_date} onChange={f('booking_date')} />
          </Field>
          <Field label="Time *">
            <Inp type="time" required value={form.booking_time} onChange={f('booking_time')} />
          </Field>
          <Field label="Party Size *">
            <Inp type="number" required min="1" value={form.party_size} onChange={f('party_size')} />
          </Field>
        </FormGrid>

        <Field label="Table">
          <Sel value={form.table_id} onChange={e => setForm(p => ({ ...p, table_id: e.target.value }))}>
            <option value="">No table assigned</option>
            {eligibleTables.map(t => (
              <option key={t.id} value={t.id}>
                {t.table_number} · {t.location} · {t.capacity} seats
              </option>
            ))}
          </Sel>
          {conflictWarning && (
            <p className="mt-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-1.5">
              ⚠ {conflictWarning}
            </p>
          )}
        </Field>

        <Field label="Special Requests">
          <textarea rows={3} className={`${fieldCls} resize-none`}
            placeholder="Dietary requirements, occasion, seating preferences…"
            value={form.special_requests} onChange={f('special_requests')} />
        </Field>

        <Field label="Notes">
          <textarea rows={2} className={`${fieldCls} resize-none`}
            placeholder="Internal notes…"
            value={form.notes} onChange={f('notes')} />
        </Field>

        <button type="submit" disabled={busy}
          className="inline-flex items-center justify-center bg-teal hover:bg-teal-deep text-white font-medium px-4 py-2 rounded-lg text-sm shadow-sm hover:shadow-md wl-transition disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? 'Creating…' : 'Create Booking'}
        </button>
      </form>
    </div>
  )
}
