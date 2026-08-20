import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { ROLE_LABELS } from '../../lib/roles'
import { Field, Inp, Sel } from './AdminUI'
import { Button, FormGrid, FormActions, SectionHead } from '../ui/kit'

const ROLES = Object.keys(ROLE_LABELS)

const BLANK = { full_name: '', email: '', password: '', role: ROLES[0], department: '', shift_name: '' }

export default function AddUserTab() {
  const [form,        setForm]        = useState(BLANK)
  const [formError,   setFormError]   = useState(null)
  const [formBusy,    setFormBusy]    = useState(false)
  const [success,     setSuccess]     = useState(null)
  const [departments, setDepartments] = useState([])
  const [shiftOptions,setShiftOptions]= useState([])

  async function fetchDepartments() {
    const { data } = await supabase.from('departments').select('*').order('name')
    if (data) setDepartments(data)
  }

  async function fetchShifts(dept) {
    if (!dept) { setShiftOptions([]); return }
    const { data } = await supabase
      .from('shift_settings')
      .select('shift_name, shift_start, shift_end, shift_type')
      .eq('department', dept)
      .order('shift_name')
    const opts = data ?? []
    setShiftOptions(opts)
    // Auto-select if only one (non-rotating) shift
    const nonRotating = opts.filter(s => s.shift_type !== 'rotating')
    if (nonRotating.length === 1) {
      setForm(f => ({ ...f, shift_name: nonRotating[0].shift_name }))
    } else {
      setForm(f => ({ ...f, shift_name: '' }))
    }
  }

  function handleDeptChange(dept) {
    setForm(f => ({ ...f, department: dept, shift_name: '' }))
    fetchShifts(dept)
  }

  async function handleAddUser(e) {
    e.preventDefault()
    setFormBusy(true)
    setFormError(null)
    setSuccess(null)
    try {
      // The Edge Function verifies this token server-side and requires the
      // caller to be an active owner. Sending the anon key here (as this did
      // before) authenticated nothing — it is public and in the bundle.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Your session has expired. Sign in again to add a user.')
      }

      const payload = { ...form }
      if (!payload.shift_name) delete payload.shift_name
      const response = await fetch(
        'https://gttsjmxltrxxfplqjans.supabase.co/functions/v1/create-user',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to create user')
      // The password is deliberately NOT carried into this object. It was
      // echoed back on screen in plaintext after creation, which is the one
      // place it appears outside the (masked) input the owner just typed into.
      // Open since AUDIT_1; C-47#3.
      setSuccess({ email: form.email, role: form.role })
      setForm(BLANK)
      setShiftOptions([])
    } catch (err) {
      setFormError(err.message)
    } finally {
      setFormBusy(false)
    }
  }

  useEffect(() => { fetchDepartments() }, [])

  const nonRotatingShifts = shiftOptions.filter(s => s.shift_type !== 'rotating')

  return (
    <div className="p-6">
      <SectionHead
        title="Add system user"
        subtitle="Creates a login. The account is made server-side by an Edge Function — the temporary password is never stored or shown again here."
        className="mb-6"
      />

      {success && (
        <div className="max-w-4xl bg-ok-bg border border-green-200 rounded-xl p-4 space-y-1.5 mb-6">
          <p className="text-sm font-bold text-green-800">User created</p>
          <p className="text-sm text-green-700">
            Email: <span className="font-mono bg-white/60 px-1.5 py-0.5 rounded">{success.email}</span>
          </p>
          <p className="text-sm text-green-700">Role: {ROLE_LABELS[success.role] ?? success.role}</p>
          <p className="text-xs text-green-700/80 mt-2 leading-relaxed">
            Give the temporary password to {success.email} yourself — it is not shown
            again here. They can change it after their first sign-in.
          </p>
        </div>
      )}

      {formError && (
        <div className="max-w-4xl bg-alert-bg border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-6">
          {formError}
        </div>
      )}

      <form onSubmit={handleAddUser} className="max-w-4xl">
        <FormGrid>
          <Field label="Full name *">
            <Inp required value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Full name" />
          </Field>

          <Field label="Email *" hint="This is what they sign in with.">
            <Inp required type="email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="user@woodlands.com" />
          </Field>

          <Field label="Temporary password *" hint="Minimum 6 characters. Pass it on yourself.">
            {/* type="password": this was type="text", so the password sat legible
                on screen while the owner filled the rest of the form. C-47#3. */}
            <Inp required type="password" minLength={6} value={form.password}
              autoComplete="new-password"
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Min 6 characters" />
          </Field>

          <Field label="Role *">
            <Sel required value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Sel>
          </Field>

          <Field
            label="Department"
            hint={
              form.department && nonRotatingShifts.length === 1
                ? `Shift auto-assigned: ${nonRotatingShifts[0].shift_name} (${nonRotatingShifts[0].shift_start?.slice(0, 5)} – ${nonRotatingShifts[0].shift_end?.slice(0, 5)})`
                : 'Scopes a Department Head to one department.'
            }
          >
            <Sel value={form.department} onChange={e => handleDeptChange(e.target.value)}>
              <option value="">None</option>
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </Sel>
          </Field>

          {/* Shift picker — only when the department genuinely has a choice. */}
          {form.department && nonRotatingShifts.length > 1 && (
            <Field label="Shift">
              <Sel value={form.shift_name} onChange={e => setForm(f => ({ ...f, shift_name: e.target.value }))}>
                <option value="">Select shift…</option>
                {nonRotatingShifts.map(s => (
                  <option key={s.shift_name} value={s.shift_name}>
                    {s.shift_name} ({s.shift_start?.slice(0, 5)} – {s.shift_end?.slice(0, 5)})
                  </option>
                ))}
              </Sel>
            </Field>
          )}
        </FormGrid>

        <FormActions>
          <Button type="submit" disabled={formBusy}>
            {formBusy ? 'Creating…' : 'Create user'}
          </Button>
        </FormActions>
      </form>
    </div>
  )
}
