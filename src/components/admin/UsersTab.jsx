import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { ROLE_LABELS } from '../../lib/roles'
import { Th, Td, fmtDate, Toast, Field, Inp, Sel, Button, EmptyRow } from './AdminUI'
import { useFlash } from '../ui/useFlash'

export default function UsersTab() {
  const [users,       setUsers]       = useState([])
  const [busyId,      setBusyId]      = useState(null)
  const [editUser,    setEditUser]    = useState(null)
  const [editForm,    setEditForm]    = useState({})
  const [shiftOpts,   setShiftOpts]   = useState([])
  const [departments, setDepartments] = useState([])
  const [toast,       setToast]       = useState(null)
  const flash = useFlash(setToast)

  async function fetchUsers() {
    const { data } = await supabase.from('user_profiles').select('*').order('full_name')
    if (data) setUsers(data)
  }

  async function fetchDepartments() {
    const { data } = await supabase.from('departments').select('*').order('name')
    if (data) setDepartments(data)
  }

  async function fetchShifts(dept) {
    if (!dept) { setShiftOpts([]); return }
    const { data } = await supabase
      .from('shift_settings')
      .select('shift_name, shift_start, shift_end, shift_type')
      .eq('department', dept)
      .order('shift_name')
    setShiftOpts(data ?? [])
  }

  function openEdit(u) {
    setEditUser(u)
    setEditForm({
      full_name:  u.full_name  ?? '',
      department: u.department ?? '',
      shift_name: u.shift_name ?? '',
    })
    fetchShifts(u.department)
  }

  function handleEditDeptChange(dept) {
    setEditForm(f => ({ ...f, department: dept, shift_name: '' }))
    fetchShifts(dept)
  }

  async function handleSaveEdit() {
    if (!editUser) return
    setBusyId(editUser.id)
    try {
      const patch = {
        full_name:  editForm.full_name  || null,
        department: editForm.department || null,
        shift_name: editForm.shift_name || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase
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
      const { error } = await supabase
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

  return (
    <div className="p-6 space-y-4">
      <Toast toast={toast} />
      <h2 className="text-[15px] font-bold text-navy">System Users ({users.length})</h2>
      <div className="wl-scroll-x border border-line rounded-xl bg-white">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-line">
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Department</Th>
              <Th>Shift</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const busy = busyId === u.id
              return (
                <tr key={u.id} className="border-b border-line last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-semibold text-navy">{u.full_name ?? '—'}</td>
                  <Td>{u.email}</Td>
                  <Td>{ROLE_LABELS[u.role] ?? u.role}</Td>
                  <Td>{u.department}</Td>
                  <Td>{u.shift_name}</Td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${
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
                        className="px-3 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 wl-transition">
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={busy}
                        className={`px-3 py-1 text-xs font-medium rounded-lg disabled:opacity-60 wl-transition ${
                          u.is_active !== false
                            ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                            : 'bg-teal/5 hover:bg-teal/10 text-teal border border-teal/20'
                        }`}>
                        {busy ? '…' : u.is_active !== false ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {users.length === 0 && (
              <EmptyRow
                cols={8}
                msg="No system users yet. Create the first login under Add User — these are the accounts that can sign in, not the staff roster."
              />
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
              <Field label="Full Name">
                <Inp
                  type="text"
                  value={editForm.full_name}
                  onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                />
              </Field>

              <Field label="Department">
                <Sel
                  value={editForm.department}
                  onChange={e => handleEditDeptChange(e.target.value)}
                >
                  <option value="">— None —</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </Sel>
              </Field>

              {/* Shift selector */}
              {nonRotatingShifts.length > 1 && (
                <Field label="Shift">
                  <Sel
                    value={editForm.shift_name}
                    onChange={e => setEditForm(f => ({ ...f, shift_name: e.target.value }))}
                  >
                    <option value="">— Select shift —</option>
                    {nonRotatingShifts.map(s => (
                      <option key={s.shift_name} value={s.shift_name}>
                        {s.shift_name} ({s.shift_start?.slice(0,5)} – {s.shift_end?.slice(0,5)})
                      </option>
                    ))}
                  </Sel>
                </Field>
              )}
              {nonRotatingShifts.length === 1 && (
                <p className="text-xs text-gray-500">
                  Shift: <span className="font-medium text-gray-700">{nonRotatingShifts[0].shift_name}</span>
                  <span className="ml-1 text-gray-400">(auto-assigned)</span>
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                onClick={handleSaveEdit}
                disabled={!!busyId}
                className="flex-1">
                {busyId ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="secondary" onClick={() => setEditUser(null)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
