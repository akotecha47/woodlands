import { useState } from 'react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, fieldCls, Toast, useFlash } from '../admin/AdminUI'
import { STALL_TYPES, todayStr, AccessDenied } from './FarmersMarketUI'

const BLANK = {
  full_name: '', business_name: '', stall_number: '',
  stall_type: 'Produce', phone: '', email: '', notes: '',
}

export default function AddHolderTab({ onCreated }) {
  const { profile, session } = useAuth()
  const canAdd = ['owner', 'manager'].includes(profile?.role)

  const [form,       setForm]       = useState(BLANK)
  const [stallError, setStallError] = useState('')
  const [busy,       setBusy]       = useState(false)
  const [toast,      setToast]      = useState(null)
  const flash = useFlash(setToast)

  const STALL_RE = /^[A-Za-z]+\d{2}$/

  if (!canAdd) return <AccessDenied />

  function f(field) {
    return e => setForm(p => ({ ...p, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!STALL_RE.test(form.stall_number)) {
      setStallError('Stall number must be in format A01, B12, FM01 etc.')
      return
    }
    setStallError('')
    setBusy(true)
    try {
      // Pre-check for duplicate stall number among non-inactive holders
      const { data: taken } = await supabaseAdmin
        .from('fm_holders')
        .select('id')
        .eq('stall_number', form.stall_number.toUpperCase())
        .not('status', 'eq', 'inactive')
        .maybeSingle()
      if (taken) {
        setStallError('Stall number is already in use by an active holder')
        setBusy(false)
        return
      }

      const { error } = await supabaseAdmin.from('fm_holders').insert({
        full_name:        form.full_name,
        business_name:    form.business_name    || null,
        stall_number:     form.stall_number,
        stall_type:       form.stall_type,
        phone:            form.phone,
        email:            form.email            || null,
        notes:            form.notes            || null,
        status:           'pending_review',
        application_paid: false,
        acceptance_paid:  false,
        created_by:       session?.user?.id ?? null,
      })
      if (error) {
        throw error.message?.includes('stall_number')
          ? new Error('Stall number is already in use')
          : error
      }
      flash('Holder added')
      setForm(BLANK)
      onCreated?.()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  return (
    <div className="p-6 max-w-xl">
      <Toast toast={toast} />
      <h2 className="text-base font-semibold text-gray-800 mb-5">Add Holder</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full Name *">
            <Inp required placeholder="Full name" value={form.full_name} onChange={f('full_name')} />
          </Field>
          <Field label="Business Name">
            <Inp placeholder="Trading name" value={form.business_name} onChange={f('business_name')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Stall Number *">
            <Inp
              required
              placeholder="e.g. A01, FM01"
              value={form.stall_number}
              onChange={e => { setStallError(''); setForm(p => ({ ...p, stall_number: e.target.value })) }}
              onBlur={() => setForm(p => ({ ...p, stall_number: p.stall_number.toUpperCase() }))}
            />
            {stallError && <p className="text-xs text-red-600 mt-1">{stallError}</p>}
          </Field>
          <Field label="Stall Type *">
            <Sel required value={form.stall_type} onChange={f('stall_type')}>
              {STALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Sel>
          </Field>
        </div>

        <Field label="Phone *">
          <div className="flex items-center border border-gray-300 rounded-lg px-2 bg-white focus-within:ring-2 focus-within:ring-green-600">
            <PhoneInput
              international
              defaultCountry="MW"
              value={form.phone}
              onChange={val => setForm(p => ({ ...p, phone: val ?? '' }))}
              inputClassName="flex-1 py-2 px-1 text-sm outline-none border-none bg-transparent min-w-0"
            />
          </div>
        </Field>

        <Field label="Email">
          <Inp type="email" placeholder="Email address (optional)" value={form.email} onChange={f('email')} />
        </Field>

        <Field label="Notes">
          <textarea rows={3} className={`${fieldCls} resize-none`}
            placeholder="Any notes about this holder…"
            value={form.notes} onChange={f('notes')} />
        </Field>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
          Holder will be created with status <strong>Pending Review</strong> until approved by a manager.
          Application fee of <strong>MWK 10,000</strong> must be logged separately in the Payments tab.
        </div>

        <button type="submit" disabled={busy}
          className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
          {busy ? 'Adding…' : 'Add Holder'}
        </button>
      </form>
    </div>
  )
}
