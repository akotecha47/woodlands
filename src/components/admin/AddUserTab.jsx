import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { ROLE_LABELS } from '../../lib/roles'
import { Field, Inp, Sel } from './AdminUI'

const ROLES = Object.keys(ROLE_LABELS)

export default function AddUserTab() {
  const [form,        setForm]        = useState({ full_name: '', email: '', password: '', role: ROLES[0], department: '' })
  const [formError,   setFormError]   = useState(null)
  const [formBusy,    setFormBusy]    = useState(false)
  const [success,     setSuccess]     = useState(null)
  const [departments, setDepartments] = useState([])

  async function fetchDepartments() {
    const { data } = await supabaseAdmin.from('departments').select('*').order('name')
    if (data) setDepartments(data)
  }

  async function handleAddUser(e) {
    e.preventDefault()
    setFormBusy(true)
    setFormError(null)
    setSuccess(null)
    try {
      console.log('[handleAddUser] invoking create-user with:', JSON.stringify(form))
      const { data, error } = await supabase.functions.invoke('create-user', { body: form })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setSuccess({ email: form.email, password: form.password, role: form.role })
      setForm({ full_name: '', email: '', password: '', role: ROLES[0], department: '' })
    } catch (err) {
      setFormError(err.message)
    } finally {
      setFormBusy(false)
    }
  }

  useEffect(() => { fetchDepartments() }, [])

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
          <p className="text-sm text-green-700">
            Role: {ROLE_LABELS[success.role] ?? success.role}
          </p>
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
          <Inp
            required
            value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            placeholder="Full name"
          />
        </Field>
        <Field label="Email *">
          <Inp
            required
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="user@woodlandslodge.mw"
          />
        </Field>
        <Field label="Temporary Password *">
          <Inp
            required
            minLength={6}
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="Min 6 characters"
          />
        </Field>
        <Field label="Role *">
          <Sel required value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Sel>
        </Field>
        <Field label="Department">
          <Sel value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
            <option value="">— None —</option>
            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </Sel>
        </Field>
        <button
          type="submit"
          disabled={formBusy}
          className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
          {formBusy ? 'Creating…' : 'Create User'}
        </button>
      </form>
    </div>
  )
}
