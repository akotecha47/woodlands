import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { ROLE_LABELS } from '../../lib/roles'
import { Field, Inp, Sel } from './AdminUI'

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
    const { data } = await supabaseAdmin.from('departments').select('*').order('name')
    if (data) setDepartments(data)
  }

  async function fetchShifts(dept) {
    if (!dept) { setShiftOptions([]); return }
    const { data } = await supabaseAdmin
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
      const payload = { ...form }
      if (!payload.shift_name) delete payload.shift_name
      const response = await fetch(
        'https://gttsjmxltrxxfplqjans.supabase.co/functions/v1/create-user',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(payload),
        }
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to create user')
      setSuccess({ email: form.email, password: form.password, role: form.role })
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
    <div className="p-6 space-y-5 max-w-lg">
      <h2 className="text-base font-semibold text-gray-800">Add System User</h2>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1.5">
          <p className="text-sm font-semibold text-green-800">User created successfully</p>
          <p className="text-sm text-green-700">
            Email: <span className="font-mono bg-green-100 px-1.5 py-0.5 rounded">{success.email}</span>
          </p>
          <p className="text-sm text-green-700">
            Password: <span className="font-mono bg-green-100 px-1.5 py-0.5 rounded">{success.password}</span>
          </p>
          <p className="text-sm text-green-700">Role: {ROLE_LABELS[success.role] ?? success.role}</p>
          <p className="text-xs text-green-600 mt-2">
            Share these credentials securely. The user can change their password after first login.
          </p>
        </div>
      )}

      {formError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {formError}
        </div>
      )}

      <form onSubmit={handleAddUser} className="space-y-4">
        <Field label="Full Name *">
          <Inp required value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            placeholder="Full name" />
        </Field>
        <Field label="Email *">
          <Inp required type="email" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="user@woodlandslodge.mw" />
        </Field>
        <Field label="Temporary Password *">
          <Inp required minLength={6} value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="Min 6 characters" />
        </Field>
        <Field label="Role *">
          <Sel required value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Sel>
        </Field>
        <Field label="Department">
          <Sel value={form.department} onChange={e => handleDeptChange(e.target.value)}>
            <option value="">— None —</option>
            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </Sel>
        </Field>

        {/* Shift dropdown — shown when department has multiple shifts */}
        {form.department && nonRotatingShifts.length > 1 && (
          <Field label="Shift">
            <Sel value={form.shift_name} onChange={e => setForm(f => ({ ...f, shift_name: e.target.value }))}>
              <option value="">— Select shift —</option>
              {nonRotatingShifts.map(s => (
                <option key={s.shift_name} value={s.shift_name}>
                  {s.shift_name} ({s.shift_start?.slice(0,5)} – {s.shift_end?.slice(0,5)})
                </option>
              ))}
            </Sel>
          </Field>
        )}
        {form.department && nonRotatingShifts.length === 1 && (
          <p className="text-xs text-gray-500">
            Shift: <span className="font-medium text-gray-700">{nonRotatingShifts[0].shift_name}</span>
            {' '}({nonRotatingShifts[0].shift_start?.slice(0,5)} – {nonRotatingShifts[0].shift_end?.slice(0,5)})
            <span className="ml-1 text-gray-400">(auto-assigned)</span>
          </p>
        )}

        <button type="submit" disabled={formBusy}
          className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
          {formBusy ? 'Creating…' : 'Create User'}
        </button>
      </form>
    </div>
  )
}
