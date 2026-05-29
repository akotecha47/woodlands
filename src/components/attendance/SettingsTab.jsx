import { useState, useEffect } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Toast, useFlash } from '../admin/AdminUI'
import { AT_MANAGE_ROLES, fmtTime, AccessDenied } from './AttendanceUI'

const BLANK_ROW = {
  department: '', shift_name: '', shift_start: '08:30', shift_end: '16:30',
  late_threshold: '15', days_per_week: '6', shift_type: 'standard',
}

export default function SettingsTab() {
  const { profile } = useAuth()
  const canManage = AT_MANAGE_ROLES.includes(profile?.role)

  if (!canManage) return <AccessDenied />

  const [shifts,    setShifts]    = useState([])
  const [editId,    setEditId]    = useState(null)  // id of row in edit mode
  const [editData,  setEditData]  = useState({})
  const [adding,    setAdding]    = useState(false)
  const [newRow,    setNewRow]    = useState(BLANK_ROW)
  const [busy,      setBusy]      = useState(false)
  const [toast,     setToast]     = useState(null)
  const flash = useFlash(setToast)

  async function load() {
    const { data } = await supabaseAdmin.from('shift_settings')
      .select('*')
      .order('department')
      .order('shift_name')
    setShifts(data ?? [])
  }

  useEffect(() => { load() }, [])

  function startEdit(row) {
    setEditId(row.id)
    setEditData({
      department:     row.department,
      shift_name:     row.shift_name,
      shift_start:    row.shift_start.slice(0, 5),
      shift_end:      row.shift_end.slice(0, 5),
      late_threshold: String(row.late_threshold),
      days_per_week:  String(row.days_per_week),
      shift_type:     row.shift_type,
    })
  }

  async function saveEdit() {
    setBusy(true)
    try {
      const { error } = await supabaseAdmin.from('shift_settings').update({
        department:     editData.department,
        shift_name:     editData.shift_name,
        shift_start:    editData.shift_start,
        shift_end:      editData.shift_end,
        late_threshold: Number(editData.late_threshold),
        days_per_week:  Number(editData.days_per_week),
        shift_type:     editData.shift_type,
      }).eq('id', editId)
      if (error) throw error
      flash('Shift updated')
      setEditId(null)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function saveNew() {
    if (!newRow.department || !newRow.shift_name) {
      flash('Department and shift name are required', false)
      return
    }
    setBusy(true)
    try {
      const { error } = await supabaseAdmin.from('shift_settings').insert({
        department:     newRow.department,
        shift_name:     newRow.shift_name,
        shift_start:    newRow.shift_start,
        shift_end:      newRow.shift_end,
        late_threshold: Number(newRow.late_threshold),
        days_per_week:  Number(newRow.days_per_week),
        shift_type:     newRow.shift_type,
      })
      if (error) throw error
      flash('Shift added')
      setAdding(false)
      setNewRow(BLANK_ROW)
      load()
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function deleteShift(id) {
    if (!window.confirm('Delete this shift setting?')) return
    try {
      const { error } = await supabaseAdmin.from('shift_settings').delete().eq('id', id)
      if (error) throw error
      flash('Shift deleted')
      load()
    } catch (err) { flash(err.message, false) }
  }

  const cellCls = 'px-2 py-2 text-sm text-gray-700'
  const inputCls = 'w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-600'

  function EditRow({ data, onChange, onSave, onCancel }) {
    return (
      <tr className="bg-blue-50/40 border-b border-blue-100">
        <td className="px-2 py-2"><input value={data.department} onChange={e => onChange('department', e.target.value)} className={inputCls} placeholder="Department" /></td>
        <td className="px-2 py-2"><input value={data.shift_name} onChange={e => onChange('shift_name', e.target.value)} className={inputCls} placeholder="Shift name" /></td>
        <td className="px-2 py-2"><input type="time" value={data.shift_start} onChange={e => onChange('shift_start', e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-2"><input type="time" value={data.shift_end} onChange={e => onChange('shift_end', e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-2"><input type="number" min="0" value={data.late_threshold} onChange={e => onChange('late_threshold', e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-2"><input type="number" min="1" max="7" value={data.days_per_week} onChange={e => onChange('days_per_week', e.target.value)} className={inputCls} /></td>
        <td className="px-2 py-2">
          <select value={data.shift_type} onChange={e => onChange('shift_type', e.target.value)} className={inputCls}>
            <option value="standard">Standard</option>
            <option value="rotating">Rotating</option>
          </select>
        </td>
        <td className="px-2 py-2">
          <div className="flex gap-1.5">
            <button onClick={onSave} disabled={busy} className="text-xs font-medium px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-60">Save</button>
            <button onClick={onCancel} className="text-xs font-medium px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors">Cancel</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="p-6">
      <Toast toast={toast} />
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">Shift Settings</h2>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="text-sm font-medium px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
            + Add Shift
          </button>
        )}
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Department', 'Shift Name', 'Start', 'End', 'Late Threshold (min)', 'Days/Week', 'Type', 'Actions'].map(h => (
                <th key={h} className="text-left px-2 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shifts.map(row => (
              editId === row.id ? (
                <EditRow
                  key={row.id}
                  data={editData}
                  onChange={(field, val) => setEditData(p => ({ ...p, [field]: val }))}
                  onSave={saveEdit}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className={cellCls}>{row.department}</td>
                  <td className={cellCls}>{row.shift_name}</td>
                  <td className={cellCls + ' font-mono'}>{fmtTime(row.shift_start)}</td>
                  <td className={cellCls + ' font-mono'}>{fmtTime(row.shift_end)}</td>
                  <td className={cellCls}>{row.late_threshold}</td>
                  <td className={cellCls}>{row.days_per_week}</td>
                  <td className={cellCls}>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      row.shift_type === 'rotating' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                    }`}>{row.shift_type}</span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1.5">
                      <button onClick={() => startEdit(row)}
                        className="text-xs font-medium px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded transition-colors">
                        Edit
                      </button>
                      <button onClick={() => deleteShift(row.id)}
                        className="text-xs font-medium px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded transition-colors">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ))}

            {adding && (
              <EditRow
                data={newRow}
                onChange={(field, val) => setNewRow(p => ({ ...p, [field]: val }))}
                onSave={saveNew}
                onCancel={() => { setAdding(false); setNewRow(BLANK_ROW) }}
              />
            )}

            {shifts.length === 0 && !adding && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">No shift settings</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
