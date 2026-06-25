import { useState } from 'react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, fieldCls, Toast, useFlash } from '../admin/AdminUI'
import { EVENT_TYPES, VENUES, todayStr, AccessDenied, SERVICE_STYLES, CONFERENCE_SETUPS } from './EventsUI'

const ALLOWED = ['owner', 'manager']

const BLANK = {
  name: '', event_type: 'wedding', event_date: '', start_time: '', end_time: '',
  guest_count: '', venue_area: '', organiser_name: '', organiser_contact: '',
  organiser_email: '', special_requirements: '', notes: '',
}

const BLANK_SETUP = {
  service_style: '', service_style_other: '',
  furniture_layout: '', stage_required: false, stage_notes: '',
  conference_setup: 'not_applicable', conference_setup_other: '',
  cake_cutting_table: false, cake_cutting_notes: '',
  drinks_menu: '', food_notes: '', other_setup: '',
}

function hasSetupValues(s) {
  return s.service_style !== '' || s.service_style_other !== '' ||
    s.furniture_layout !== '' || s.stage_required || s.stage_notes !== '' ||
    s.conference_setup !== 'not_applicable' || s.conference_setup_other !== '' ||
    s.cake_cutting_table || s.cake_cutting_notes !== '' ||
    s.drinks_menu !== '' || s.food_notes !== '' || s.other_setup !== ''
}

export default function CreateEventTab({ onCreated }) {
  const { profile, session } = useAuth()
  const [form, setForm] = useState({ ...BLANK, event_date: todayStr() })
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const flash = useFlash(setToast)
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupForm, setSetupForm] = useState(BLANK_SETUP)

  if (!ALLOWED.includes(profile?.role)) return <AccessDenied />

  function f(field)   { return e => setForm(prev => ({ ...prev, [field]: e.target.value })) }
  function fs(field)  { return e => setSetupForm(prev => ({ ...prev, [field]: e.target.value })) }
  function fsc(field) { return e => setSetupForm(prev => ({ ...prev, [field]: e.target.checked })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const { data: newEvent, error } = await supabaseAdmin.from('events')
        .insert({
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
        }).select().single()
      if (error) throw error

      if (setupOpen && hasSetupValues(setupForm)) {
        const { error: setupErr } = await supabaseAdmin.from('event_configurations').insert({
          event_id:               newEvent.id,
          service_style:          setupForm.service_style                          || null,
          service_style_other:    setupForm.service_style === 'other'
                                    ? setupForm.service_style_other                || null : null,
          furniture_layout:       setupForm.furniture_layout                       || null,
          stage_required:         setupForm.stage_required,
          stage_notes:            setupForm.stage_required
                                    ? setupForm.stage_notes                        || null : null,
          conference_setup:       setupForm.conference_setup                       || null,
          conference_setup_other: setupForm.conference_setup === 'other'
                                    ? setupForm.conference_setup_other             || null : null,
          cake_cutting_table:     setupForm.cake_cutting_table,
          cake_cutting_notes:     setupForm.cake_cutting_table
                                    ? setupForm.cake_cutting_notes                 || null : null,
          drinks_menu:            setupForm.drinks_menu                            || null,
          food_notes:             setupForm.food_notes                             || null,
          other_setup:            setupForm.other_setup                            || null,
          created_by:             session?.user?.id ?? null,
        })
        if (setupErr) {
          flash('Event created, but setup details failed to save — you can add them from the event view', false)
        } else {
          flash('Event created')
        }
      } else {
        flash('Event created')
      }

      setForm({ ...BLANK, event_date: todayStr() })
      setSetupForm(BLANK_SETUP)
      setSetupOpen(false)
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
            <div className="flex items-center border border-gray-300 rounded-lg px-2 bg-white focus-within:ring-2 focus-within:ring-brand-teal">
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

        {/* Setup Details — collapsible optional panel */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setSetupOpen(o => !o)}
            className="w-full flex items-center gap-2 bg-gray-50 px-4 py-2.5 text-left hover:bg-gray-100 transition-colors"
          >
            {setupOpen
              ? <ChevronDown  className="w-4 h-4 text-gray-400 shrink-0" />
              : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
            }
            <span className="text-sm font-medium text-gray-700">Setup Details (optional)</span>
            <span className="text-xs text-gray-400 ml-1">Add now or fill in later from the event view</span>
          </button>

          {setupOpen && (
            <div className="p-4 space-y-4">

              <div className="grid grid-cols-2 gap-3">
                <Field label="Service Style">
                  <Sel value={setupForm.service_style} onChange={fs('service_style')}>
                    <option value="">Select…</option>
                    {SERVICE_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Sel>
                </Field>
                {setupForm.service_style === 'other' && (
                  <Field label="Service Style — Other">
                    <Inp placeholder="Specify style" value={setupForm.service_style_other} onChange={fs('service_style_other')} />
                  </Field>
                )}
              </div>

              <Field label="Drinks Menu">
                <textarea rows={2} className={`${fieldCls} resize-none`}
                  placeholder="e.g. Welcome cocktail, house wine, beer, soft drinks, full bar from 19:00"
                  value={setupForm.drinks_menu} onChange={fs('drinks_menu')} />
              </Field>

              <Field label="Food Notes">
                <textarea rows={2} className={`${fieldCls} resize-none`}
                  placeholder="e.g. 3-course plated meal, vegetarian option for 12 guests, halal for 5"
                  value={setupForm.food_notes} onChange={fs('food_notes')} />
              </Field>

              <Field label="Furniture Layout">
                <textarea rows={2} className={`${fieldCls} resize-none`}
                  placeholder="e.g. Long banquet tables seating 80, U-shape head table for 12, lounge area"
                  value={setupForm.furniture_layout} onChange={fs('furniture_layout')} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Conference Setup">
                  <Sel value={setupForm.conference_setup} onChange={fs('conference_setup')}>
                    {CONFERENCE_SETUPS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Sel>
                </Field>
                {setupForm.conference_setup === 'other' && (
                  <Field label="Conference Setup — Other">
                    <Inp placeholder="Specify setup" value={setupForm.conference_setup_other} onChange={fs('conference_setup_other')} />
                  </Field>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={setupForm.stage_required} onChange={fsc('stage_required')}
                      className="rounded border-gray-300 text-brand-teal focus:ring-brand-teal" />
                    <span className="text-sm font-medium text-gray-700">Stage Required</span>
                  </label>
                  {setupForm.stage_required && (
                    <Inp placeholder="Size, position, AV needs" value={setupForm.stage_notes} onChange={fs('stage_notes')} />
                  )}
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={setupForm.cake_cutting_table} onChange={fsc('cake_cutting_table')}
                      className="rounded border-gray-300 text-brand-teal focus:ring-brand-teal" />
                    <span className="text-sm font-medium text-gray-700">Cake Cutting Table</span>
                  </label>
                  {setupForm.cake_cutting_table && (
                    <Inp placeholder="Position, timing" value={setupForm.cake_cutting_notes} onChange={fs('cake_cutting_notes')} />
                  )}
                </div>
              </div>

              <Field label="Other Setup Details">
                <textarea rows={3} className={`${fieldCls} resize-none`}
                  placeholder="Anything else worth noting for setup — decorations, special equipment, timing dependencies, etc."
                  value={setupForm.other_setup} onChange={fs('other_setup')} />
              </Field>

            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs text-blue-700">
          Event will be created with status <strong>Enquiry</strong>. BEO checklists are auto-generated when status is changed to Confirmed.
        </div>

        <button type="submit" disabled={busy}
          className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
          {busy ? 'Creating…' : 'Create Event'}
        </button>
      </form>
    </div>
  )
}
