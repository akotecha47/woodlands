import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { ROLE_LABELS } from '../../lib/roles'
import { Th, Td, fmtDate, Toast, useFlash } from './AdminUI'

export default function UsersTab() {
  const [users,  setUsers]  = useState([])
  const [busyId, setBusyId] = useState(null)
  const [toast,  setToast]  = useState(null)
  const flash = useFlash(setToast)

  async function fetchUsers() {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .order('full_name')
    console.log('[UsersTab] fetchUsers data:', data, 'error:', error)
    if (data) setUsers(data)
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

  useEffect(() => { fetchUsers() }, [])

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
                      u.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
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
  )
}
