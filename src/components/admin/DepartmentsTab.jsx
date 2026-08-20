import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Toast } from './AdminUI'
import { Button, Inp, SectionHead, EmptyState } from '../ui/kit'
import { useFlash } from '../ui/useFlash'

export default function DepartmentsTab() {
  const [departments, setDepartments] = useState([])
  const [deptInput,   setDeptInput]   = useState('')
  const [deptBusy,    setDeptBusy]    = useState(false)
  const [editingDept, setEditingDept] = useState(null) // { id, name }
  const [toast,       setToast]       = useState(null)
  const flash = useFlash(setToast)

  async function fetchDepartments() {
    const { data } = await supabase.from('departments').select('*').order('name')
    if (data) setDepartments(data)
  }

  async function addDepartment(e) {
    e.preventDefault()
    const name = deptInput.trim()
    if (!name) return
    setDeptBusy(true)
    try {
      const { error } = await supabase.from('departments').insert({ name })
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
      const { error } = await supabase.from('departments').delete().eq('id', dept.id)
      if (error) throw error
      await fetchDepartments()
      flash(`Department "${dept.name}" deleted`)
    } catch (err) { flash(err.message, false) }
  }

  async function saveDeptRename() {
    const name = editingDept.name.trim()
    if (!name) return
    try {
      const { error } = await supabase.from('departments').update({ name }).eq('id', editingDept.id)
      if (error) throw error
      setEditingDept(null)
      await fetchDepartments()
      flash(`Renamed to "${name}"`)
    } catch (err) { flash(err.message, false) }
  }

  useEffect(() => { fetchDepartments() }, [])

  return (
    <div className="p-6 space-y-6">
      <Toast toast={toast} />
      <SectionHead
        title="Departments"
        subtitle="Department names are stored as plain text everywhere they are used, so a rename here does not ripple. Rename with care."
      />

      <form onSubmit={addDepartment} className="flex gap-3 max-w-xl">
        <Inp
          placeholder="New department name"
          aria-label="New department name"
          value={deptInput}
          onChange={e => setDeptInput(e.target.value)}
        />
        <Button type="submit" disabled={deptBusy || !deptInput.trim()}>Add</Button>
      </form>

      <ul className="divide-y divide-line border border-line rounded-xl overflow-hidden max-w-xl bg-white">
        {departments.map(d => (
          <li key={d.id} className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 wl-transition">
            {editingDept?.id === d.id ? (
              <>
                <Inp
                  value={editingDept.name}
                  aria-label={`Rename ${d.name}`}
                  onChange={e => setEditingDept(ed => ({ ...ed, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') saveDeptRename(); if (e.key === 'Escape') setEditingDept(null) }}
                  autoFocus
                />
                <Button size="sm" onClick={saveDeptRename}>Save</Button>
                <Button size="sm" variant="secondary" onClick={() => setEditingDept(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-semibold text-navy">{d.name}</span>
                <Button size="sm" variant="secondary" onClick={() => setEditingDept({ id: d.id, name: d.name })}>
                  Edit
                </Button>
                <Button size="sm" variant="danger" onClick={() => deleteDepartment(d)}>Delete</Button>
              </>
            )}
          </li>
        ))}
        {departments.length === 0 && (
          <li>
            <EmptyState
              title="No departments yet"
              body="Add the first one above. Departments drive stock locations, shift settings and Department Head scoping."
            />
          </li>
        )}
      </ul>
    </div>
  )
}
