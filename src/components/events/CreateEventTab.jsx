import { useState } from 'react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, fieldCls, Toast, useFlash } from '../admin/AdminUI'
import { EVENT_TYPES, VENUES, todayStr, AccessDenied } from './EventsUI'

const ALLOWED = ['owner', 'manager']

const BLANK = {
  name: '', event_type: 'wedding', event_date: '', start_time: '', end_time: '',
  guest_count: '', venue_area: '', organiser_name: '', organiser_contact: '',
  organiser_email: '', special_requirements: '', notes: '',
}

export default function CreateEventTab({ onCreated }) {
  const { profile, session } = useAuth()
  const [form, setForm] = useState({ ...BLANK, event_date: todayStr() })
  const [busy, setBusy] = useState(false)
  const [toast,          setToast]          = useState(null)
  const flash = useFlash(setToast)

  if (!ALLOWED.includes(profile?.role)) return <AccessDenied />

  function f(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const { error } = await supabaseAdmin.from('events').insert({
        name:                 form.name,
        event_type:           form.event_type,
        event_date:           form.event_date,
        start_time:           form.start_time || null,
        end_time:             form.end_time || null,
        guest_count:          form.guest_count ? Number(form.guest_count) : null,
        venue_area:           form.venue_area || null,
        organiser_name:       form.organiser_name || null,
        organiser_contact:    form.organiser_contact || null,
        organiser_email:      form.organiser_email || null,
        deposit_paid:         false,
        status:               'enquiry',
        special_requirements: form.special_requirements || null,
        notes:                form.notes || null,
        created_by:           session?.user?.id ?? null,
      })
      if (error) throw error
      flash('Event created')
      setForm({ ...BLANK, event_date: todayStr() })
      onCreated?.()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  return (
    <div className="p-6 max-w-2xl">
      <Toast toast={toast} />
      <h2 className="text-base font-semibold text-gray-800 mb-5">Create New Event</h2>
      <form onSubmit={handleSubmit} className="space-y-4">

        <div className="grid grid-cols-2 gap-4">
          <Field label="Event Name *">
            <Inp required placeholder="Event name" value={form.name} onChange={f('name')} />
          </Field>
          <Field label="Event Type *">
            <Sel required value={form.event_type} onChange={f('event_type')}>
              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Sel>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Event Date *">
            <Inp type="date" required value={form.event_date} onChange={f('event_date')} />
          </Field>
          <Field label="Start Time">
            <Inp type="time" value={form.start_time} onChange={f('start_time')} />
          </Field>
          <Field label="End Time">
            <Inp type="time" value={form.end_time} onChange={f('end_time')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Guest Count">
            <Inp type="number" min="0" placeholder="Number of guests"
              value={form.guest_count} onChange={f('guest_count')} />
          </Field>
          <Field label="Venue Area">
            <Sel value={form.venue_area} onChange={f('venue_area')}>
              <option value="">Select venue area…</option>
              {VENUES.map(v => <option key={v} value={v}>{v}</option>)}
            </Sel>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Organiser Name">
            <Inp placeholder="Full name" value={form.organiser_name} onChange={f('organiser_name')} />
          </Field>
          <Field label="Organiser Contact">
            {/* Phone input wrapper styled to match fieldCls */}
            <div className="flex items-center border border-gray-300 rounded-lg px-2 bg-white focus-within:ring-2 focus-within:ring-green-600">
              <PhoneInput
                international
                defaultCountry="MW"
                value={form.organiser_contact}
                onChange={val => setForm(prev => ({ ...prev, organiser_contact: val ?? '' }))}
                inputClassName="flex-1 py-2 px-1 text-sm outline-none border-none bg-transparent min-w-0"
              />
            </div>
          </Field>
          <Field label="Organiser Email">
            <Inp type="email" placeholder="Email address" value={form.organiser_email} onChange={f('organiser_email')} />
          </Field>
        </div>

        <Field label="Special Requirements">
          <textarea rows={4} className={`${fieldCls} resize-none`}
            placeholder="Dietary requirements, AV equipment, seating preferences…"
            value={form.special_requirements} onChange={f('special_requirements')} />
        </Field>

        <Field label="Notes">
          <textarea rows={4} className={`${fieldCls} resize-none`}
            placeholder="Internal notes…"
            value={form.notes} onChange={f('notes')} />
        </Field>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs text-blue-700">
          Event will be created with status <strong>Enquiry</strong>. BEO checklists are auto-generated when status is changed to Confirmed.
        </div>

        <button type="submit" disabled={busy}
          className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
          {busy ? 'Creating…' : 'Create Event'}
        </button>
      </form>
    </div>
  )
}
