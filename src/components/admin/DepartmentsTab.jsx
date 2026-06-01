import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { Toast, useFlash } from './AdminUI'

export default function DepartmentsTab() {
  const [departments, setDepartments] = useState([])
  const [deptInput,   setDeptInput]   = useState('')
  const [deptBusy,    setDeptBusy]    = useState(false)
  const [editingDept, setEditingDept] = useState(null) // { id, name }
  const [toast,       setToast]       = useState(null)
  const flash = useFlash(setToast)

  async function fetchDepartments() {
    const { data } = await supabaseAdmin.from('departments').select('*').order('name')
    if (data) setDepartments(data)
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

  useEffect(() => { fetchDepartments() }, [])

  return (
    <div className="p-6 space-y-5 max-w-lg">
      <Toast toast={toast} />
      <h2 className="text-base font-semibold text-gray-800">Departments</h2>

      <form onSubmit={addDepartment} className="flex gap-2">
        <input
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          placeholder="New department name"
          value={deptInput}
          onChange={e => setDeptInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={deptBusy || !deptInput.trim()}
          className="bg-brand-teal hover:bg-brand-teal-dark text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60 whitespace-nowrap">
          Add
        </button>
      </form>

      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
        {departments.map(d => (
          <li key={d.id} className="flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50">
            {editingDept?.id === d.id ? (
              <>
                <input
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  value={editingDept.name}
                  onChange={e => setEditingDept(ed => ({ ...ed, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') saveDeptRename(); if (e.key === 'Escape') setEditingDept(null) }}
                  autoFocus
                />
                <button onClick={saveDeptRename} className="px-3 py-1 text-xs font-medium bg-brand-teal hover:bg-brand-teal-dark text-white rounded-lg transition-colors">Save</button>
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
  )
}
