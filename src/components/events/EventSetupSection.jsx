import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, fieldCls, Toast, useFlash } from '../admin/AdminUI'
import { SERVICE_STYLES, CONFERENCE_SETUPS } from './EventsUI'

const BLANK = {
  service_style:          '',
  service_style_other:    '',
  furniture_layout:       '',
  stage_required:         false,
  stage_notes:            '',
  conference_setup:       'not_applicable',
  conference_setup_other: '',
  cake_cutting_table:     false,
  cake_cutting_notes:     '',
  drinks_menu:            '',
  food_notes:             '',
  other_setup:            '',
}

function cfgToForm(cfg) {
  return {
    service_style:          cfg.service_style          ?? '',
    service_style_other:    cfg.service_style_other    ?? '',
    furniture_layout:       cfg.furniture_layout       ?? '',
    stage_required:         cfg.stage_required         ?? false,
    stage_notes:            cfg.stage_notes            ?? '',
    conference_setup:       cfg.conference_setup       ?? 'not_applicable',
    conference_setup_other: cfg.conference_setup_other ?? '',
    cake_cutting_table:     cfg.cake_cutting_table     ?? false,
    cake_cutting_notes:     cfg.cake_cutting_notes     ?? '',
    drinks_menu:            cfg.drinks_menu            ?? '',
    food_notes:             cfg.food_notes             ?? '',
    other_setup:            cfg.other_setup            ?? '',
  }
}

function ReadField({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900">{value || '—'}</p>
    </div>
  )
}

export default function EventSetupSection({ eventId, canManage, onRefresh }) {
  const { session } = useAuth()
  const [cfg,   setCfg]   = useState(null)
  const [form,  setForm]  = useState(BLANK)
  const [busy,  setBusy]  = useState(false)
  const [toast, setToast] = useState(null)
  const flash = useFlash(setToast)

  async function load() {
    const { data } = await supabaseAdmin
      .from('event_configurations')
      .select('*')
      .eq('event_id', eventId)
      .maybeSingle()
    setCfg(data ?? null)
    if (data) setForm(cfgToForm(data))
  }

  useEffect(() => { load() }, [eventId])

  function f(field)  { return e => setForm(prev => ({ ...prev, [field]: e.target.value })) }
  function fc(field) { return e => setForm(prev => ({ ...prev, [field]: e.target.checked })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.service_style) { flash('Service Style is required', false); return }
    setBusy(true)
    try {
      const payload = {
        event_id:               eventId,
        service_style:          form.service_style,
        service_style_other:    form.service_style === 'other' ? form.service_style_other || null : null,
        furniture_layout:       form.furniture_layout       || null,
        stage_required:         form.stage_required,
        stage_notes:            form.stage_required         ? form.stage_notes            || null : null,
        conference_setup:       form.conference_setup       || null,
        conference_setup_other: form.conference_setup === 'other' ? form.conference_setup_other || null : null,
        cake_cutting_table:     form.cake_cutting_table,
        cake_cutting_notes:     form.cake_cutting_table     ? form.cake_cutting_notes     || null : null,
        drinks_menu:            form.drinks_menu            || null,
        food_notes:             form.food_notes             || null,
        other_setup:            form.other_setup            || null,
        updated_at:             new Date().toISOString(),
      }
      if (cfg) {
        const { error } = await supabaseAdmin
          .from('event_configurations').update(payload).eq('id', cfg.id)
        if (error) throw error
      } else {
        const { error } = await supabaseAdmin
          .from('event_configurations').insert({ ...payload, created_by: session?.user?.id ?? null })
        if (error) throw error
      }
      flash(cfg ? 'Setup details updated' : 'Setup details saved')
      await load()
      onRefresh()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  // ── Read-only view ─────────────────────────────────────────────────────────

  if (!canManage) {
    const styleLabel  = SERVICE_STYLES.find(s => s.value === cfg?.service_style)?.label    ?? cfg?.service_style
    const setupLabel  = CONFERENCE_SETUPS.find(s => s.value === cfg?.conference_setup)?.label ?? cfg?.conference_setup

    return (
      <div>
        <h3 className="text-base font-semibold text-gray-800 mb-4">Setup Details</h3>
        {!cfg ? (
          <p className="text-sm text-gray-400">No setup details saved yet.</p>
        ) : (
          <div className="bg-gray-50 rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <ReadField
                label="Service Style"
                value={cfg.service_style === 'other' ? `Other — ${cfg.service_style_other || '—'}` : styleLabel}
              />
              <ReadField
                label="Conference Setup"
                value={cfg.conference_setup === 'other' ? `Other — ${cfg.conference_setup_other || '—'}` : setupLabel}
              />
            </div>
            <ReadField label="Drinks Menu"      value={cfg.drinks_menu}      />
            <ReadField label="Food Notes"       value={cfg.food_notes}       />
            <ReadField label="Furniture Layout" value={cfg.furniture_layout} />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <ReadField label="Stage Required" value={cfg.stage_required ? 'Yes' : 'No'} />
                {cfg.stage_required && <ReadField label="Stage Notes" value={cfg.stage_notes} />}
              </div>
              <div className="space-y-2">
                <ReadField label="Cake Cutting Table" value={cfg.cake_cutting_table ? 'Yes' : 'No'} />
                {cfg.cake_cutting_table && <ReadField label="Cake Cutting Notes" value={cfg.cake_cutting_notes} />}
              </div>
            </div>
            <ReadField label="Other Setup Details" value={cfg.other_setup} />
          </div>
        )}
      </div>
    )
  }

  // ── Edit form ──────────────────────────────────────────────────────────────

  return (
    <div>
      <Toast toast={toast} />
      <h3 className="text-base font-semibold text-gray-800 mb-4">Setup Details</h3>
      {!cfg && (
        <p className="text-sm text-gray-400 mb-4">No setup details saved yet.</p>
      )}

      <form onSubmit={handleSave} className="border border-gray-200 rounded-xl p-4 space-y-4">

        {/* Row 1: Service Style */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Service Style *">
            <Sel required value={form.service_style} onChange={f('service_style')}>
              <option value="">Select…</option>
              {SERVICE_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Sel>
          </Field>
          {form.service_style === 'other' && (
            <Field label="Service Style — Other">
              <Inp
                placeholder="Specify style"
                value={form.service_style_other}
                onChange={f('service_style_other')}
              />
            </Field>
          )}
        </div>

        {/* Row 2: Drinks Menu */}
        <Field label="Drinks Menu">
          <textarea
            rows={2}
            placeholder="e.g. Welcome cocktail, house wine, beer, soft drinks, full bar from 19:00"
            value={form.drinks_menu}
            onChange={f('drinks_menu')}
            className={fieldCls}
          />
        </Field>

        {/* Row 3: Food Notes */}
        <Field label="Food Notes">
          <textarea
            rows={2}
            placeholder="e.g. 3-course plated meal, vegetarian option for 12 guests, halal for 5"
            value={form.food_notes}
            onChange={f('food_notes')}
            className={fieldCls}
          />
        </Field>

        {/* Row 4: Furniture Layout */}
        <Field label="Furniture Layout">
          <textarea
            rows={2}
            placeholder="e.g. Long banquet tables seating 80, U-shape head table for 12, lounge area"
            value={form.furniture_layout}
            onChange={f('furniture_layout')}
            className={fieldCls}
          />
        </Field>

        {/* Row 5: Conference Setup */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Conference Setup">
            <Sel value={form.conference_setup} onChange={f('conference_setup')}>
              {CONFERENCE_SETUPS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Sel>
          </Field>
          {form.conference_setup === 'other' && (
            <Field label="Conference Setup — Other">
              <Inp
                placeholder="Specify setup"
                value={form.conference_setup_other}
                onChange={f('conference_setup_other')}
              />
            </Field>
          )}
        </div>

        {/* Row 6: Stage + Cake */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.stage_required}
                onChange={fc('stage_required')}
                className="rounded border-gray-300 text-brand-teal focus:ring-brand-teal"
              />
              <span className="text-sm font-medium text-gray-700">Stage Required</span>
            </label>
            {form.stage_required && (
              <Inp
                placeholder="Size, position, AV needs"
                value={form.stage_notes}
                onChange={f('stage_notes')}
              />
            )}
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.cake_cutting_table}
                onChange={fc('cake_cutting_table')}
                className="rounded border-gray-300 text-brand-teal focus:ring-brand-teal"
              />
              <span className="text-sm font-medium text-gray-700">Cake Cutting Table</span>
            </label>
            {form.cake_cutting_table && (
              <Inp
                placeholder="Position, timing"
                value={form.cake_cutting_notes}
                onChange={f('cake_cutting_notes')}
              />
            )}
          </div>
        </div>

        {/* Row 7: Other Setup Details */}
        <Field label="Other Setup Details">
          <textarea
            rows={3}
            placeholder="Anything else worth noting for setup — decorations, special equipment, timing dependencies, etc."
            value={form.other_setup}
            onChange={f('other_setup')}
            className={fieldCls}
          />
        </Field>

        <button type="submit" disabled={busy}
          className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
          {busy ? 'Saving…' : cfg ? 'Update Setup Details' : 'Save Setup Details'}
        </button>

      </form>
    </div>
  )
}
