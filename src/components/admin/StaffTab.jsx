import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Th, Td, fmtDate, Toast, useFlash, Field, Inp, fieldCls } from './AdminUI'

const BLANK = {
  full_name:       '',
  employee_number: '',
  department:      '',
  position:        '',
  shift_start:     '',
  shift_end:       '',
  hire_date:       '',
  notes:           '',
}

export default function StaffTab() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'

  const [staff,        setStaff]        = useState([])
  const [allDepts,     setAllDepts]     = useState([])
  const [deptFilter,   setDeptFilter]   = useState('')
  const [search,       setSearch]       = useState('')
  const [editRec,      setEditRec]      = useState(null)  // null = closed
  const [isAdding,     setIsAdding]     = useState(false)
  const [editForm,     setEditForm]     = useState(BLANK)
  const [confirmDeact, setConfirmDeact] = useState(null)  // staff row awaiting confirm
  const [busyId,       setBusyId]       = useState(null)
  const [toast,        setToast]        = useState(null)
  const flash = useFlash(setToast)

  async function fetchStaff() {
    const { data } = await supabaseAdmin
      .from('staff')
      .select('*')
      .order('department').order('full_name')
    if (data) {
      setStaff(data)
      setAllDepts([...new Set(data.map(s => s.department).filter(Boolean))].sort())
    }
  }

  useEffect(() => { fetchStaff() }, [])

  function openAdd() {
    setIsAdding(true)
    setEditRec({})
    setEditForm(BLANK)
  }

  function openEdit(s) {
    setIsAdding(false)
    setEditRec(s)
    setEditForm({
      full_name:       s.full_name       ?? '',
      employee_number: s.employee_number ?? '',
      department:      s.department      ?? '',
      position:        s.position        ?? '',
      shift_start:     s.shift_start     ?? '',
      shift_end:       s.shift_end       ?? '',
      hire_date:       s.hire_date       ?? '',
      notes:           s.notes           ?? '',
    })
  }

  async function handleSave() {
    setBusyId('saving')
    try {
      const patch = {
        full_name:       editForm.full_name       || null,
        employee_number: editForm.employee_number || null,
        department:      editForm.department      || null,
        position:        editForm.position        || null,
        shift_start:     editForm.shift_start     || null,
        shift_end:       editForm.shift_end       || null,
        notes:           editForm.notes           || null,
        updated_at:      new Date().toISOString(),
      }
      if (isAdding) {
        patch.hire_date = editForm.hire_date || null
        patch.is_active = true
        const { error } = await supabaseAdmin.from('staff').insert(patch)
        if (error) throw error
        flash('Staff member added')
      } else {
        const { error } = await supabaseAdmin.from('staff').update(patch).eq('id', editRec.id)
        if (error) throw error
        flash('Staff record updated')
      }
      setEditRec(null)
      fetchStaff()
    } catch (err) { flash(err.message, false) }
    finally { setBusyId(null) }
  }

  async function handleDeactivate(s) {
    setBusyId(s.id)
    setConfirmDeact(null)
    try {
      const { error } = await supabaseAdmin.from('staff')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', s.id)
      if (error) throw error
      flash(`${s.full_name ?? s.employee_number ?? 'Staff member'} deactivated`)
      fetchStaff()
    } catch (err) { flash(err.message, false) }
    finally { setBusyId(null) }
  }

  async function handleReactivate(s) {
    setBusyId(s.id)
    try {
      const { error } = await supabaseAdmin.from('staff')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', s.id)
      if (error) throw error
      flash(`${s.full_name ?? s.employee_number ?? 'Staff member'} reactivated`)
      fetchStaff()
    } catch (err) { flash(err.message, false) }
    finally { setBusyId(null) }
  }

  const filtered = staff.filter(s => {
    if (deptFilter && s.department !== deptFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !(s.full_name       ?? '').toLowerCase().includes(q) &&
        !(s.employee_number ?? '').toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  return (
    <div className="p-6 space-y-4">
      <Toast toast={toast} />

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-gray-800 mr-auto">
          Staff ({staff.length})
        </h2>
        {isOwner && (
          <button
            onClick={openAdd}
            className="px-3 py-1.5 bg-brand-teal hover:bg-brand-teal-dark text-white text-xs font-medium rounded-lg transition-colors"
          >
            + Add Staff
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
        >
          <option value="">All departments</option>
          {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or emp no…"
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal w-52"
        />
        {(deptFilter || search) && (
          <button
            onClick={() => { setDeptFilter(''); setSearch('') }}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 border border-gray-200 rounded-lg"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {filtered.length} of {staff.length}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th>Emp No</Th>
              <Th>Full Name</Th>
              <Th>Department</Th>
              <Th>Position</Th>
              <Th>Shift</Th>
              <Th>Hire Date</Th>
              <Th>Status</Th>
              {isOwner && <Th>Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => {
              const busy = busyId === s.id
              const shiftLabel = s.shift_start && s.shift_end
                ? `${s.shift_start.slice(0, 5)} – ${s.shift_end.slice(0, 5)}`
                : null
              return (
                <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <Td>{s.employee_number}</Td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {s.full_name ?? '—'}
                  </td>
                  <Td>{s.department}</Td>
                  <Td>{s.position}</Td>
                  <Td>{shiftLabel}</Td>
                  <Td>{fmtDate(s.hire_date)}</Td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      s.is_active !== false
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-600'
                    }`}>
                      {s.is_active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {isOwner && (
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => openEdit(s)}
                          className="px-3 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => s.is_active !== false ? setConfirmDeact(s) : handleReactivate(s)}
                          disabled={busy}
                          className={`px-3 py-1 text-xs font-medium rounded-lg disabled:opacity-60 transition-colors ${
                            s.is_active !== false
                              ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                              : 'bg-brand-teal/5 hover:bg-brand-teal/10 text-brand-teal border border-brand-teal/20'
                          }`}
                        >
                          {busy ? '…' : s.is_active !== false ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isOwner ? 8 : 7} className="px-4 py-8 text-center text-sm text-gray-400">
                  No staff records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Deactivate confirmation */}
      {confirmDeact && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h4 className="text-base font-semibold text-gray-900 mb-3">Deactivate staff member?</h4>
            <p className="text-sm text-gray-600 mb-5">
              Deactivate <strong>{confirmDeact.full_name ?? confirmDeact.employee_number}</strong>?
              They will be hidden from attendance and scheduling views.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDeactivate(confirmDeact)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Deactivate
              </button>
              <button
                onClick={() => setConfirmDeact(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {editRec !== null && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold text-gray-900">
                {isAdding ? 'Add Staff Member' : 'Edit Staff Record'}
              </h4>
              <button onClick={() => setEditRec(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            <div className="space-y-3">
              <Field label="Full Name">
                <Inp
                  value={editForm.full_name}
                  onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Full name"
                />
              </Field>
              <Field label="Employee Number">
                <Inp
                  value={editForm.employee_number}
                  onChange={e => setEditForm(f => ({ ...f, employee_number: e.target.value }))}
                  placeholder="WL…"
                />
              </Field>
              <Field label="Department">
                <Inp
                  value={editForm.department}
                  onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="e.g. Kitchen"
                />
              </Field>
              <Field label="Position">
                <Inp
                  value={editForm.position}
                  onChange={e => setEditForm(f => ({ ...f, position: e.target.value }))}
                  placeholder="e.g. Continental Chef"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Shift Start">
                  <input
                    type="time"
                    value={editForm.shift_start}
                    onChange={e => setEditForm(f => ({ ...f, shift_start: e.target.value }))}
                    className={fieldCls}
                  />
                </Field>
                <Field label="Shift End">
                  <input
                    type="time"
                    value={editForm.shift_end}
                    onChange={e => setEditForm(f => ({ ...f, shift_end: e.target.value }))}
                    className={fieldCls}
                  />
                </Field>
              </div>
              {isAdding && (
                <Field label="Hire Date">
                  <input
                    type="date"
                    value={editForm.hire_date}
                    onChange={e => setEditForm(f => ({ ...f, hire_date: e.target.value }))}
                    className={fieldCls}
                  />
                </Field>
              )}
              <Field label="Notes">
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  className={`${fieldCls} resize-none`}
                  placeholder="Optional notes…"
                />
              </Field>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={!!busyId}
                className="flex-1 bg-brand-teal hover:bg-brand-teal-dark text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                {busyId ? 'Saving…' : isAdding ? 'Add Staff' : 'Save'}
              </button>
              <button
                onClick={() => setEditRec(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
