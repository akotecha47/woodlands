import { useEffect, useState, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { supabaseAdmin, hasAdminClient } from '../lib/supabaseAdmin'
import { ALL_ROLES, ROLE_LABELS } from '../lib/roles'

// ─── Shared ───────────────────────────────────────────────────────────────────

function Badge({ variant, children }) {
  const cls = {
    green: 'bg-green-100 text-green-700',
    red:   'bg-red-100 text-red-700',
    gray:  'bg-gray-100 text-gray-600',
    amber: 'bg-amber-100 text-amber-700',
  }[variant] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  )
}

function Alert({ variant, children }) {
  const cls = variant === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-green-50 border-green-200 text-green-700'
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 ' +
  'placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
const submitBtnCls =
  'w-full rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-medium text-white ' +
  'hover:bg-[#15803d] focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50 ' +
  'disabled:opacity-50 transition-colors'
const thCls =
  'whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500'
const tdCls = 'px-4 py-3'

// ─── No Admin Client Notice ───────────────────────────────────────────────────

function AdminClientNotice() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex gap-3">
      <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
      <div className="text-sm text-amber-800 space-y-1">
        <p className="font-semibold">Service role key not configured</p>
        <p>
          Adding and deactivating users requires the Supabase service role key. To enable this:
        </p>
        <ol className="list-decimal list-inside space-y-0.5 mt-1">
          <li>Open <strong>Supabase Dashboard → Project Settings → API</strong></li>
          <li>Copy the <strong>service_role</strong> secret key</li>
          <li>Create <code className="bg-amber-100 px-1 rounded">.env.local</code> in the project root</li>
          <li>Add: <code className="bg-amber-100 px-1 rounded">VITE_SUPABASE_SERVICE_ROLE_KEY=your_key_here</code></li>
          <li>Restart the dev server</li>
        </ol>
        <p className="mt-2 text-amber-700 text-xs">
          In production, move these admin operations to a Supabase Edge Function to avoid exposing the service role key.
        </p>
      </div>
    </div>
  )
}

// ─── Tab 1: Users ─────────────────────────────────────────────────────────────

function UsersList({ users, loading, onRefresh }) {
  const [actionId, setActionId] = useState(null)
  const [error, setError] = useState(null)

  async function toggleActive(u) {
    setActionId(u.id)
    setError(null)
    const newActive = !u.is_active

    // Update profile
    const { error: profileErr } = await supabaseAdmin
      .from('user_profiles')
      .update({ is_active: newActive })
      .eq('id', u.id)

    if (profileErr) { setError(profileErr.message); setActionId(null); return }

    // Ban / unban the auth user
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(u.id, {
      ban_duration: newActive ? 'none' : '876600h',
    })

    if (authErr) { setError(authErr.message); setActionId(null); return }

    setActionId(null)
    onRefresh()
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Name', 'Email', 'Role', 'Department', 'Status', 'Since', 'Action'].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No users found.</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50/60">
                <td className={`${tdCls} font-medium text-gray-900`}>{u.full_name}</td>
                <td className={`${tdCls} text-gray-600`}>{u.email}</td>
                <td className={tdCls}>
                  <Badge variant="gray">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                </td>
                <td className={`${tdCls} text-gray-600`}>{u.departments?.name ?? '—'}</td>
                <td className={tdCls}>
                  <Badge variant={u.is_active ? 'green' : 'red'}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className={`${tdCls} text-gray-500 text-xs`}>
                  {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className={tdCls}>
                  {hasAdminClient ? (
                    <button
                      onClick={() => toggleActive(u)}
                      disabled={actionId === u.id}
                      className={[
                        'rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                        u.is_active
                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                          : 'bg-green-50 text-green-700 hover:bg-green-100',
                      ].join(' ')}
                    >
                      {actionId === u.id ? '…' : u.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Tab 2: Add User ──────────────────────────────────────────────────────────

const addDefaults = {
  full_name: '', email: '', password: '', role: 'waiter', department_id: '',
}

function AddUser({ departments, onSaved }) {
  const [form, setForm]         = useState(addDefaults)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess]   = useState(false)
  const [error, setError]       = useState(null)

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true); setError(null); setSuccess(false)

    // 1. Create auth user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email:         form.email,
      password:      form.password,
      email_confirm: true,
    })

    if (authErr) { setError(authErr.message); setSubmitting(false); return }

    // 2. Insert profile
    const { error: profileErr } = await supabaseAdmin.from('user_profiles').insert({
      id:            authData.user.id,
      full_name:     form.full_name,
      email:         form.email,
      role:          form.role,
      department_id: form.department_id || null,
    })

    if (profileErr) {
      // Roll back: delete the auth user we just created
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      setError(profileErr.message)
      setSubmitting(false)
      return
    }

    setSuccess(true)
    setForm(addDefaults)
    setSubmitting(false)
    onSaved()
  }

  const rolesNeedingDept = ['head_of_department', 'barman', 'kitchen_staff', 'store_supervisor']

  return (
    <div className="max-w-lg space-y-4">
      {!hasAdminClient && <AdminClientNotice />}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-6"
      >
        <h2 className="text-base font-semibold text-gray-900">Add New User</h2>

        {success && <Alert variant="success">User created and can now log in with the provided credentials.</Alert>}
        {error   && <Alert variant="error">{error}</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Full Name</label>
            <input required type="text" value={form.full_name} onChange={set('full_name')}
              placeholder="Jane Smith" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input required type="email" value={form.email} onChange={set('email')}
              placeholder="jane@example.com" className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Temporary Password</label>
          <input required type="text" value={form.password} onChange={set('password')}
            placeholder="They can change this after first login" minLength={6}
            className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Role</label>
            <select required value={form.role} onChange={set('role')} className={inputCls}>
              {ALL_ROLES.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              Department
              {!rolesNeedingDept.includes(form.role) && (
                <span className="ml-1 text-gray-400 font-normal">(optional)</span>
              )}
            </label>
            <select value={form.department_id} onChange={set('department_id')} className={inputCls}>
              <option value="">None</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !hasAdminClient}
          className={submitBtnCls}
        >
          {submitting ? 'Creating…' : 'Create User'}
        </button>
      </form>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = ['Users', 'Add User']

export default function Admin() {
  const [tab, setTab]           = useState(0)
  const [users, setUsers]       = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading]   = useState(true)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('user_profiles')
      .select('*, departments(name)')
      .order('full_name')
    setUsers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)
      const [{ data: depts }, { data: u }] = await Promise.all([
        supabase.from('departments').select('*').order('name'),
        supabase.from('user_profiles').select('*, departments(name)').order('full_name'),
      ])
      if (cancelled) return
      setDepartments(depts ?? [])
      setUsers(u ?? [])
      setLoading(false)
    }

    init()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Admin Panel</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage system users and access — visible to Owner only.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={[
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === i
                ? 'border-[#16a34a] text-[#16a34a]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <UsersList users={users} loading={loading} onRefresh={fetchUsers} />
      )}
      {tab === 1 && (
        <AddUser departments={departments} onSaved={() => { fetchUsers(); setTab(0) }} />
      )}
    </div>
  )
}
