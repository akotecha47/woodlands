import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import { ROLE_LABELS } from '../lib/roles'

const ROLES = Object.keys(ROLE_LABELS)

const DEPT_CODES = {
  'Kitchen':         'KIT',
  'Restaurant Bar':  'RBA',
  'Sports Bar':      'SBA',
  'Restaurant':      'RST',
  'Housekeeping':    'HSK',
  'Grounds':         'GRD',
  'Security':        'SEC',
}

function deptCode(dept) { return DEPT_CODES[dept] ?? 'GEN' }

function defaultUnit(dept) {
  if (!dept) return 'units'
  if (dept === 'Kitchen' || dept === 'Restaurant') return 'kg'
  if (dept.toLowerCase().includes('bar')) return 'litres'
  return 'units'
}

const TABS = [
  { id: 'users',       label: 'Users'       },
  { id: 'add_user',    label: 'Add User'    },
  { id: 'departments', label: 'Departments' },
  { id: 'stock_items', label: 'Stock Items' },
]

// ── shared UI ──────────────────────────────────────────────────

const fieldCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 disabled:bg-gray-50'

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
function Inp(props)                  { return <input  className={fieldCls} {...props} /> }
function Sel({ children, ...props }) { return <select className={fieldCls} {...props}>{children}</select> }
function Th({ children }) {
  return <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{children}</th>
}
function Td({ children }) {
  return <td className="px-4 py-3 text-sm text-gray-600">{children ?? '—'}</td>
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── main component ─────────────────────────────────────────────

export default function Admin() {
  const [tab,       setTab]       = useState('users')
  const [users,     setUsers]     = useState([])
  const [busyId,    setBusyId]    = useState(null)
  const [toast,     setToast]     = useState(null)
  const [success,   setSuccess]   = useState(null)
  const [formError, setFormError] = useState(null)
  const [formBusy,  setFormBusy]  = useState(false)

  const [form, setForm] = useState({
    full_name: '', email: '', password: '', role: ROLES[0], department: '',
  })

  const [departments, setDepartments] = useState([])
  const [deptInput,   setDeptInput]   = useState('')
  const [deptBusy,    setDeptBusy]    = useState(false)
  const [editingDept, setEditingDept] = useState(null) // { id, name }

  const [stockItems,   setStockItems]   = useState([])
  const [stockBusy,    setStockBusy]    = useState(false)
  const [editingStock, setEditingStock] = useState(null) // { id, name, unit, reorder_level }
  const [stockForm,    setStockForm]    = useState({ name: '', unit: 'units', department: '', reorder_level: 0 })

  function flash(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  async function fetchUsers() {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .order('full_name')
    console.log('[Admin] fetchUsers data:', data, 'error:', error)
    if (data) setUsers(data)
  }

  async function fetchDepartments() {
    const { data } = await supabaseAdmin.from('departments').select('*').order('name')
    if (data) setDepartments(data)
  }

  async function fetchStockItems() {
    const { data } = await supabaseAdmin.from('stock_items').select('*').order('name')
    if (data) setStockItems(data)
  }

  async function addStockItem(e) {
    e.preventDefault()
    setStockBusy(true)
    try {
      const dept = stockForm.department || null
      let countQuery = supabaseAdmin.from('stock_items').select('*', { count: 'exact', head: true })
      countQuery = dept ? countQuery.eq('department', dept) : countQuery.is('department', null)
      const { count } = await countQuery
      const sku = `${deptCode(dept)}-${String((count ?? 0) + 1).padStart(3, '0')}`

      const { error } = await supabaseAdmin.from('stock_items').insert({
        name: stockForm.name.trim(),
        sku,
        unit: stockForm.unit.trim(),
        department: dept,
        reorder_level: Number(stockForm.reorder_level),
      })
      if (error) throw error
      setStockForm({ name: '', unit: 'units', department: '', reorder_level: 0 })
      await fetchStockItems()
      flash(`Stock item added (SKU: ${sku})`)
    } catch (err) { flash(err.message, false) }
    finally { setStockBusy(false) }
  }

  async function toggleStockActive(item) {
    setBusyId(item.id)
    try {
      const { error } = await supabaseAdmin
        .from('stock_items')
        .update({ is_active: !item.is_active })
        .eq('id', item.id)
      if (error) throw error
      flash(`"${item.name}" ${item.is_active ? 'deactivated' : 'reactivated'}`)
      await fetchStockItems()
    } catch (err) { flash(err.message, false) }
    finally { setBusyId(null) }
  }

  async function saveStockEdit() {
    const { id, name, unit, reorder_level } = editingStock
    if (!name.trim() || !unit.trim()) return
    try {
      const { error } = await supabaseAdmin
        .from('stock_items')
        .update({ name: name.trim(), unit: unit.trim(), reorder_level: Number(reorder_level) })
        .eq('id', id)
      if (error) throw error
      setEditingStock(null)
      await fetchStockItems()
      flash('Item updated')
    } catch (err) { flash(err.message, false) }
  }

  useEffect(() => { fetchUsers(); fetchDepartments() }, [])
  useEffect(() => { if (tab === 'users') fetchUsers() }, [tab])
  useEffect(() => { if (tab === 'departments') fetchDepartments() }, [tab])
  useEffect(() => { if (tab === 'stock_items') fetchStockItems() }, [tab])

  async function toggleActive(user) {
    setBusyId(user.id)
    try {
      const { error } = await supabaseAdmin
        .from('user_profiles')
        .update({ is_active: !user.is_active, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) throw error
      flash(`${user.full_name} ${user.is_active ? 'deactivated' : 'reactivated'}`)
      fetchUsers()
    } catch (err) { flash(err.message, false) }
    finally { setBusyId(null) }
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

  async function addDepartment(e) {
    e.preventDefault()
    const name = deptInput.trim()
    if (!name) return
    setDeptBusy(true)
    try {
      const { error } = await supabaseAdmin.from('departments').insert({ name })
      if (error) throw error
      setDeptInput('')
      await fetchDepartments()
      flash(`Department "${name}" added`)
    } catch (err) { flash(err.message, false) }
    finally { setDeptBusy(false) }
  }

  async function deleteDepartment(dept) {
    if (!window.confirm(`Delete department "${dept.name}"? This cannot be undone.`)) return
    try {
      const { error } = await supabaseAdmin.from('departments').delete().eq('id', dept.id)
      if (error) throw error
      await fetchDepartments()
      flash(`Department "${dept.name}" deleted`)
    } catch (err) { flash(err.message, false) }
  }

  async function saveDeptRename() {
    const name = editingDept.name.trim()
    if (!name) return
    try {
      const { error } = await supabaseAdmin.from('departments').update({ name }).eq('id', editingDept.id)
      if (error) throw error
      setEditingDept(null)
      await fetchDepartments()
      flash(`Renamed to "${name}"`)
    } catch (err) { flash(err.message, false) }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-gray-900">Admin</h1>

      {toast && (
        <div className={`fixed top-4 right-4 z-40 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">

        {/* ── Users ───────────────────────────────────────── */}
        {tab === 'users' && (
          <div className="p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-800">System Users</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th>Department</Th>
                    <Th>Status</Th>
                    <Th>Created</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const busy = busyId === u.id
                    return (
                      <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.full_name ?? '—'}</td>
                        <Td>{u.email}</Td>
                        <Td>{ROLE_LABELS[u.role] ?? u.role}</Td>
                        <Td>{u.department}</Td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            u.is_active !== false
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-600'
                          }`}>
                            {u.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <Td>{fmtDate(u.created_at)}</Td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleActive(u)}
                            disabled={busy}
                            className={`px-3 py-1 text-xs font-medium rounded-lg disabled:opacity-60 transition-colors ${
                              u.is_active !== false
                                ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                                : 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200'
                            }`}>
                            {busy ? '…' : u.is_active !== false ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No users found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Add User ─────────────────────────────────────── */}
        {tab === 'add_user' && (
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
        )}

        {/* ── Departments ──────────────────────────────────── */}
        {tab === 'departments' && (
          <div className="p-6 space-y-5 max-w-lg">
            <h2 className="text-base font-semibold text-gray-800">Departments</h2>

            <form onSubmit={addDepartment} className="flex gap-2">
              <input
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                placeholder="New department name"
                value={deptInput}
                onChange={e => setDeptInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={deptBusy || !deptInput.trim()}
                className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60 whitespace-nowrap">
                Add
              </button>
            </form>

            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
              {departments.map(d => (
                <li key={d.id} className="flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50">
                  {editingDept?.id === d.id ? (
                    <>
                      <input
                        className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                        value={editingDept.name}
                        onChange={e => setEditingDept(ed => ({ ...ed, name: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveDeptRename(); if (e.key === 'Escape') setEditingDept(null) }}
                        autoFocus
                      />
                      <button onClick={saveDeptRename} className="px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">Save</button>
                      <button onClick={() => setEditingDept(null)} className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-800">{d.name}</span>
                      <button onClick={() => setEditingDept({ id: d.id, name: d.name })} className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">Edit</button>
                      <button onClick={() => deleteDepartment(d)} className="px-3 py-1 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg transition-colors">Delete</button>
                    </>
                  )}
                </li>
              ))}
              {departments.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-gray-400">No departments yet</li>
              )}
            </ul>
          </div>
        )}

        {/* ── Stock Items ──────────────────────────────────── */}
        {tab === 'stock_items' && (
          <div className="p-6 space-y-5">
            <h2 className="text-base font-semibold text-gray-800">Stock Items</h2>

            <form onSubmit={addStockItem} className="grid grid-cols-2 gap-3 max-w-2xl">
              <Field label="Name *">
                <Inp
                  required
                  value={stockForm.name}
                  onChange={e => setStockForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Item name"
                />
              </Field>
              <Field label="Department">
                <Sel
                  value={stockForm.department}
                  onChange={e => {
                    const dept = e.target.value
                    setStockForm(f => ({ ...f, department: dept, unit: defaultUnit(dept) }))
                  }}>
                  <option value="">— None —</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </Sel>
              </Field>
              <Field label="Unit *">
                <Inp
                  required
                  value={stockForm.unit}
                  onChange={e => setStockForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="kg / litres / units"
                />
              </Field>
              <Field label="Reorder Level">
                <Inp
                  type="number"
                  min={0}
                  value={stockForm.reorder_level}
                  onChange={e => setStockForm(f => ({ ...f, reorder_level: e.target.value }))}
                />
              </Field>
              <div className="col-span-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={stockBusy}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
                  {stockBusy ? 'Adding…' : 'Add Item'}
                </button>
                <span className="text-xs text-gray-400">SKU auto-generated on save</span>
              </div>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <Th>Name</Th>
                    <Th>SKU</Th>
                    <Th>Unit</Th>
                    <Th>Department</Th>
                    <Th>Reorder Level</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {stockItems.map(item => {
                    const editing = editingStock?.id === item.id
                    const busy = busyId === item.id
                    return (
                      <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {editing
                            ? <Inp value={editingStock.name} onChange={e => setEditingStock(s => ({ ...s, name: e.target.value }))} />
                            : <span className="font-medium">{item.name}</span>}
                        </td>
                        <Td>{item.sku}</Td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {editing
                            ? <Inp value={editingStock.unit} onChange={e => setEditingStock(s => ({ ...s, unit: e.target.value }))} />
                            : item.unit}
                        </td>
                        <Td>{item.department}</Td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {editing
                            ? <Inp type="number" min={0} value={editingStock.reorder_level} onChange={e => setEditingStock(s => ({ ...s, reorder_level: e.target.value }))} />
                            : item.reorder_level}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                          }`}>
                            {item.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {editing ? (
                              <>
                                <button
                                  onClick={saveStockEdit}
                                  className="px-3 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingStock(null)}
                                  className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setEditingStock({ id: item.id, name: item.name, unit: item.unit, reorder_level: item.reorder_level })}
                                  className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">
                                  Edit
                                </button>
                                <button
                                  onClick={() => toggleStockActive(item)}
                                  disabled={busy}
                                  className={`px-3 py-1 text-xs font-medium rounded-lg disabled:opacity-60 transition-colors ${
                                    item.is_active
                                      ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                                      : 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200'
                                  }`}>
                                  {busy ? '…' : item.is_active ? 'Deactivate' : 'Reactivate'}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {stockItems.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No stock items yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
