import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { ROLE_LABELS } from '../../lib/roles'
import { Th, Td, fmtDate, Toast, useFlash } from './AdminUI'

const BAR_ROLES = ['bar1', 'bar2']

export default function UsersTab() {
  const [users,       setUsers]       = useState([])
  const [busyId,      setBusyId]      = useState(null)
  const [editUser,    setEditUser]    = useState(null)  // user being edited
  const [editForm,    setEditForm]    = useState({})
  const [shiftOpts,   setShiftOpts]   = useState([])
  const [departments, setDepartments] = useState([])
  const [toast,       setToast]       = useState(null)
  const flash = useFlash(setToast)

  async function fetchUsers() {
    const { data } = await supabaseAdmin.from('user_profiles').select('*').order('full_name')
    if (data) setUsers(data)
  }

  async function fetchDepartments() {
    const { data } = await supabaseAdmin.from('departments').select('*').order('name')
    if (data) setDepartments(data)
  }

  async function fetchShifts(dept) {
    if (!dept) { setShiftOpts([]); return }
    const { data } = await supabaseAdmin
      .from('shift_settings')
      .select('shift_name, shift_start, shift_end, shift_type')
      .eq('department', dept)
      .order('shift_name')
    setShiftOpts(data ?? [])
  }

  function openEdit(u) {
    setEditUser(u)
    setEditForm({
      full_name:  u.full_name ?? '',
      department: u.department ?? '',
      shift_name: u.shift_name ?? '',
      bar_week:   u.bar_week ?? '',
    })
    fetchShifts(u.department)
  }

  function handleEditDeptChange(dept) {
    setEditForm(f => ({ ...f, department: dept, shift_name: '', bar_week: '' }))
    fetchShifts(dept)
  }

  async function handleSaveEdit() {
    if (!editUser) return
    if (BAR_ROLES.includes(editUser.role) && !editForm.bar_week) {
      flash('Bar Week is required for bar roles.', false)
      return
    }
    setBusyId(editUser.id)
    try {
      const patch = {
        full_name:  editForm.full_name  || null,
        department: editForm.department || null,
        shift_name: editForm.shift_name || null,
        bar_week:   editForm.bar_week   || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabaseAdmin
        .from('user_profiles').update(patch).eq('id', editUser.id)
      if (error) throw error
      flash(`${editForm.full_name || editUser.full_name} updated`)
      setEditUser(null)
      fetchUsers()
    } catch (err) { flash(err.message, false) }
    finally { setBusyId(null) }
  }

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

  useEffect(() => { fetchUsers(); fetchDepartments() }, [])

  const nonRotatingShifts = shiftOpts.filter(s => s.shift_type !== 'rotating')
  const isBarRole = BAR_ROLES.includes(editUser?.role)

  return (
    <div className="p-6 space-y-4">
      <Toast toast={toast} />
      <h2 className="text-base font-semibold text-gray-800">System Users</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Department</Th>
              <Th>Shift</Th>
              <Th>Bar Wk</Th>
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
                  <Td>{u.shift_name}</Td>
                  <Td>{u.bar_week}</Td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      u.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {u.is_active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <Td>{fmtDate(u.created_at)}</Td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => openEdit(u)}
                        className="px-3 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={busy}
                        className={`px-3 py-1 text-xs font-medium rounded-lg disabled:opacity-60 transition-colors ${
                          u.is_active !== false
                            ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                            : 'bg-brand-teal/5 hover:bg-brand-teal/10 text-brand-teal border border-brand-teal/20'
                        }`}>
                        {busy ? '…' : u.is_active !== false ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">No users found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold text-gray-900">Edit User</h4>
              <button onClick={() => setEditUser(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
                <select
                  value={editForm.department}
                  onChange={e => handleEditDeptChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                >
                  <option value="">— None —</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>

              {/* Shift selector */}
              {nonRotatingShifts.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Shift</label>
                  <select
                    value={editForm.shift_name}
                    onChange={e => setEditForm(f => ({ ...f, shift_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  >
                    <option value="">— Select shift —</option>
                    {nonRotatingShifts.map(s => (
                      <option key={s.shift_name} value={s.shift_name}>
                        {s.shift_name} ({s.shift_start?.slice(0,5)} – {s.shift_end?.slice(0,5)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {nonRotatingShifts.length === 1 && (
                <p className="text-xs text-gray-500">
                  Shift: <span className="font-medium text-gray-700">{nonRotatingShifts[0].shift_name}</span>
                  <span className="ml-1 text-gray-400">(auto-assigned)</span>
                </p>
              )}

              {/* Bar Week selector — required for bar1/bar2 roles */}
              {isBarRole && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Bar Week</label>
                  <select
                    value={editForm.bar_week}
                    onChange={e => setEditForm(f => ({ ...f, bar_week: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  >
                    <option value="">— Select —</option>
                    <option value="A">Week A</option>
                    <option value="B">Week B</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSaveEdit}
                disabled={!!busyId}
                className="flex-1 bg-brand-teal hover:bg-brand-teal-dark text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
                {busyId ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditUser(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
