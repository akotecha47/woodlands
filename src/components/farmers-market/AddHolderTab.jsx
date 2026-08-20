import { useState } from 'react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Txt, Toast } from '../admin/AdminUI'
import { Button, FormGrid, FormActions, SectionHead } from '../ui/kit'
import { FM_MANAGE_ROLES } from '../../lib/roles'
import { AccessDenied, validateStall } from './FarmersMarketUI'
import { useFlash } from '../ui/useFlash'

const BLANK = {
  full_name: '', business_name: '', stall_number: '',
  phone: '', email: '', notes: '',
}

export default function AddHolderTab({ onCreated }) {
  const { profile, session } = useAuth()
  const canAdd = FM_MANAGE_ROLES.includes(profile?.role)

  const [form,       setForm]       = useState(BLANK)
  const [stallError, setStallError] = useState('')
  const [busy,       setBusy]       = useState(false)
  const [toast,      setToast]      = useState(null)
  const flash = useFlash(setToast)

  if (!canAdd) return <AccessDenied />

  function f(field) {
    return e => setForm(p => ({ ...p, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // Normalise once, then use the SAME value for the duplicate check and the
    // insert. Previously the check ran on the upper-cased value and the insert
    // wrote the raw one, so a lower-case entry could slip past a real clash.
    const stall = form.stall_number.trim().toUpperCase()
    const stallMsg = validateStall(stall)
    if (stallMsg) {
      setStallError(stallMsg)
      return
    }
    setStallError('')
    setBusy(true)
    try {
      // Pre-check for duplicate stall number among non-inactive holders
      const { data: taken } = await supabase
        .from('fm_holders')
        .select('id')
        .eq('stall_number', stall)
        .not('status', 'eq', 'inactive')
        .maybeSingle()
      if (taken) {
        setStallError('Stall number is already in use by an active business')
        setBusy(false)
        return
      }

      const { error } = await supabase.from('fm_holders').insert({
        full_name:        form.full_name,
        business_name:    form.business_name    || null,
        stall_number:     stall,
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
      flash('Business added')
      setForm(BLANK)
      onCreated?.()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  return (
    <div className="p-6">
      <Toast toast={toast} />
      <SectionHead
        title="Add business"
        subtitle="Registers a stallholder as Pending Review. The application fee is logged separately under Payments."
        className="mb-6"
      />

      <form onSubmit={handleSubmit} className="max-w-4xl">
        <FormGrid>
          <Field label="Full name *">
            <Inp required placeholder="Full name" value={form.full_name} onChange={f('full_name')} />
          </Field>

          <Field label="Business name">
            <Inp placeholder="Trading name" value={form.business_name} onChange={f('business_name')} />
          </Field>

          <Field label="Stall number *" error={stallError} hint="Letter prefix then three digits — e.g. A001, A347.">
            <Inp
              required
              placeholder="e.g. A001, A347"
              value={form.stall_number}
              onChange={e => { setStallError(''); setForm(p => ({ ...p, stall_number: e.target.value })) }}
              onBlur={() => setForm(p => ({ ...p, stall_number: p.stall_number.toUpperCase() }))}
            />
          </Field>

          {/* Stall type is GONE (063). The column was dropped: NOT NULL,
              'Other' on all 311 rows, read by nothing but its own CHECK. What a
              business sells is its approved product list, recorded on the
              business record once it exists - the first list is free, and only
              later changes raise the per-item fee. */}

          <Field label="Phone *">
            <div className="flex items-center border border-gray-300 rounded-lg px-2 bg-white wl-transition focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/25">
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

          <Field label="Notes" span="full">
            <Txt rows={3} placeholder="Anything worth recording about this business…"
              value={form.notes} onChange={f('notes')} />
          </Field>
        </FormGrid>

        <FormActions>
          <Button type="submit" disabled={busy}>
            {busy ? 'Adding…' : 'Add business'}
          </Button>
          <p className="text-xs text-ink-soft">
            Created as <strong className="font-semibold text-navy">Pending Review</strong> until a
            manager approves it. Application fee: MWK 10,000, logged under Payments.
          </p>
        </FormActions>
      </form>
    </div>
  )
}
