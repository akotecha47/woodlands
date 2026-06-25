import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Field, Inp, Sel, Th, Td, Toast, useFlash } from '../admin/AdminUI'

const BLANK = { staff_id: '', role_label: '', notes: '' }

export default function EventStaffSection({ eventId, canManage, onRefresh }) {
  const { session } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [allStaff,    setAllStaff]    = useState([])
  const [form,        setForm]        = useState(BLANK)
  const [busy,        setBusy]        = useState(false)
  const [toast,       setToast]       = useState(null)
  const flash = useFlash(setToast)

  async function loadAssignments() {
    const { data } = await supabaseAdmin
      .from('event_staff')
      .select('*, staff(id, full_name, department)')
      .eq('event_id', eventId)
      .order('assigned_at')
    setAssignments(data ?? [])
  }

  async function loadStaff() {
    const { data } = await supabaseAdmin
      .from('staff')
      .select('id, full_name, department')
      .eq('is_active', true)
      .order('department').order('full_name')
    setAllStaff(data ?? [])
  }

  useEffect(() => {
    loadAssignments()
    if (canManage) loadStaff()
  }, [eventId])

  const assignedIds    = new Set(assignments.map(a => a.staff_id))
  const availableStaff = allStaff.filter(s => !assignedIds.has(s.id))

  async function handleAssign(e) {
    e.preventDefault()
    if (!form.staff_id || !form.role_label.trim()) {
      flash('Staff and role are required', false)
      return
    }
    setBusy(true)
    try {
      const { error } = await supabaseAdmin.from('event_staff').insert({
        event_id:    eventId,
        staff_id:    form.staff_id,
        role_label:  form.role_label.trim(),
        notes:       form.notes.trim() || null,
        assigned_by: session?.user?.id ?? null,
      })
      if (error) throw error
      flash('Staff assigned')
      setForm(BLANK)
      loadAssignments()
      onRefresh()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function handleRemove(id) {
    try {
      const { error } = await supabaseAdmin.from('event_staff').delete().eq('id', id)
      if (error) throw error
      loadAssignments()
      onRefresh()
    } catch (err) { flash(err.message, false) }
  }

  return (
    <div>
      <Toast toast={toast} />
      <h3 className="text-base font-semibold text-gray-800 mb-4">Assigned Staff</h3>

      {/* Assigned staff table */}
      {assignments.length > 0 ? (
        <div className="overflow-x-auto mb-4 border border-gray-200 rounded-xl">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <Th>Staff Name</Th>
                <Th>Department</Th>
                <Th>Role on Event</Th>
                <Th>Notes</Th>
                {canManage && <th className="px-4 py-3 w-10" />}
              </tr>
            </thead>
            <tbody>
              {assignments.map(a => (
                <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {a.staff?.full_name ?? '—'}
                  </td>
                  <Td>{a.staff?.department}</Td>
                  <Td>{a.role_label}</Td>
                  <Td>{a.notes}</Td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRemove(a.id)}
                        title="Remove assignment"
                        className="text-red-400 hover:text-red-600 transition-colors text-lg leading-none font-medium"
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-4">No staff assigned yet.</p>
      )}

      {/* Assign form — owner/manager only */}
      {canManage && (
        <div className="border border-gray-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Assign Staff</h4>
          <form onSubmit={handleAssign} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Staff *">
                  <Sel
                    required
                    value={form.staff_id}
                    onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}
                  >
                    <option value="">— Select staff —</option>
                    {availableStaff.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.full_name ?? '—'} — {s.department}
                      </option>
                    ))}
                  </Sel>
                </Field>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role on Event *">
                <Inp
                  required
                  placeholder="e.g. Head Waiter, Kitchen Lead, Security, Grounds..."
                  value={form.role_label}
                  onChange={e => setForm(f => ({ ...f, role_label: e.target.value }))}
                />
              </Field>
              <Field label="Notes">
                <Inp
                  placeholder="Any notes..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </Field>
            </div>
            <button type="submit" disabled={busy}
              className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
              {busy ? 'Assigning…' : 'Assign'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
