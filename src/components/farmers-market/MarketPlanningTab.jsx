import { useState, useEffect, useRef } from 'react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Toast, useFlash } from '../admin/AdminUI'
import { fmtDate, getLastSaturdayOfMonth, getLastNMarketDays } from './FarmersMarketUI'

const DEFAULT_TASKS = [
  'Confirm vendor list',
  'Send reminder to at-risk holders',
  'Prepare stall layout',
  'Brief security team',
  'Set up payment station',
  'Confirm market manager on duty',
]

function nextPlanDate() {
  const today = new Date()
  const thisMonth = getLastSaturdayOfMonth(today.getFullYear(), today.getMonth())
  if (new Date(thisMonth + 'T23:59:59') >= today) return thisMonth
  let year = today.getFullYear()
  let month = today.getMonth() + 1
  if (month > 11) { month = 0; year++ }
  return getLastSaturdayOfMonth(year, month)
}

export default function MarketPlanningTab() {
  const { profile, session } = useAuth()
  const canEdit = ['owner', 'manager'].includes(profile?.role)

  const [planDate,           setPlanDate]           = useState(nextPlanDate)
  const [tasks,              setTasks]              = useState([])
  const [notes,              setNotes]              = useState('')
  const [notesId,            setNotesId]            = useState(null)
  const [notesDirty,         setNotesDirty]         = useState(false)
  const [expectedAttendance, setExpectedAttendance] = useState(null)
  const [newTask,            setNewTask]            = useState('')
  const [busy,               setBusy]              = useState(false)
  const [toast,              setToast]              = useState(null)
  const flash      = useFlash(setToast)
  const notesTimer = useRef(null)

  async function fetchExpectedAttendance() {
    const lastDays = getLastNMarketDays(1)
    if (lastDays.length === 0) return 0
    const [visitsR, holdersR] = await Promise.all([
      supabaseAdmin.from('fm_visits').select('holder_id').eq('visit_date', lastDays[0]),
      supabaseAdmin.from('fm_holders').select('id').eq('status', 'active'),
    ])
    const activeIds = new Set((holdersR.data ?? []).map(h => h.id))
    return (visitsR.data ?? []).filter(v => activeIds.has(v.holder_id)).length
  }

  async function load() {
    const [tasksR, notesR, attendance] = await Promise.all([
      supabaseAdmin.from('fm_planning_tasks').select('*').eq('market_date', planDate).order('created_at'),
      supabaseAdmin.from('fm_planning_notes').select('*').eq('market_date', planDate).maybeSingle(),
      fetchExpectedAttendance(),
    ])

    const existingTasks = tasksR.data ?? []
    if (existingTasks.length === 0) {
      const rows = DEFAULT_TASKS.map(task => ({
        market_date: planDate,
        task,
        is_complete: false,
        created_by: session?.user?.id ?? null,
      }))
      const { data: inserted } = await supabaseAdmin.from('fm_planning_tasks').insert(rows).select()
      setTasks(inserted ?? rows.map((r, i) => ({ ...r, id: String(i) })))
    } else {
      setTasks(existingTasks)
    }

    setNotes(notesR.data?.notes ?? '')
    setNotesId(notesR.data?.id ?? null)
    setNotesDirty(false)
    setExpectedAttendance(attendance)
  }

  useEffect(() => { load() }, [planDate])

  async function toggleTask(task) {
    if (!canEdit) return
    const next = !task.is_complete
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_complete: next } : t))
    await supabaseAdmin.from('fm_planning_tasks').update({ is_complete: next }).eq('id', task.id)
  }

  async function addTask(e) {
    e.preventDefault()
    if (!newTask.trim()) return
    setBusy(true)
    try {
      const { data, error } = await supabaseAdmin.from('fm_planning_tasks').insert({
        market_date: planDate,
        task:        newTask.trim(),
        is_complete: false,
        created_by:  session?.user?.id ?? null,
      }).select().single()
      if (error) throw error
      setTasks(prev => [...prev, data])
      setNewTask('')
    } catch (err) { flash(err.message, false) }
    finally { setBusy(false) }
  }

  async function deleteTask(task) {
    setTasks(prev => prev.filter(t => t.id !== task.id))
    await supabaseAdmin.from('fm_planning_tasks').delete().eq('id', task.id)
  }

  async function persistNotes(val) {
    if (notesId) {
      await supabaseAdmin.from('fm_planning_notes').update({
        notes:      val,
        updated_by: session?.user?.id ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', notesId)
    } else {
      const { data } = await supabaseAdmin.from('fm_planning_notes').insert({
        market_date: planDate,
        notes:       val,
        updated_by:  session?.user?.id ?? null,
      }).select().single()
      if (data) setNotesId(data.id)
    }
    setNotesDirty(false)
  }

  function handleNotesChange(val) {
    setNotes(val)
    setNotesDirty(true)
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => persistNotes(val), 1500)
  }

  const completedCount = tasks.filter(t => t.is_complete).length
  const progressPct    = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0

  return (
    <div className="p-6 space-y-6">
      <Toast toast={toast} />

      {/* Next market day hero */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Next Market Day</p>
          <p className="text-3xl font-bold text-green-900">{fmtDate(planDate)}</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-green-700 font-medium whitespace-nowrap">Plan for:</label>
            <input
              type="date"
              value={planDate}
              onChange={e => setPlanDate(e.target.value)}
              className="border border-green-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Checklist — spans 2/3 */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Planning Checklist</h3>
            <span className="text-xs text-gray-400">{completedCount}/{tasks.length} done</span>
          </div>

          {tasks.length > 0 && (
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          <ul className="space-y-2">
            {tasks.map(task => (
              <li key={task.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                task.is_complete ? 'bg-green-50 border-green-100' : 'bg-white border-gray-200'
              }`}>
                <button
                  onClick={() => toggleTask(task)}
                  disabled={!canEdit}
                  className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    task.is_complete
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 hover:border-green-400'
                  } ${!canEdit ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  {task.is_complete && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <span className={`flex-1 text-sm ${task.is_complete ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {task.task}
                </span>
                {canEdit && (
                  <button
                    onClick={() => deleteTask(task)}
                    className="text-gray-300 hover:text-red-400 transition-colors leading-none px-1"
                    title="Remove task"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>

          {canEdit && (
            <form onSubmit={addTask} className="flex gap-2 pt-1">
              <input
                type="text"
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                placeholder="Add a task…"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              />
              <button
                type="submit"
                disabled={busy || !newTask.trim()}
                className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                Add
              </button>
            </form>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Expected attendance */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Expected Attendance</p>
            <p className="text-3xl font-bold text-blue-900">
              {expectedAttendance === null ? '—' : expectedAttendance}
            </p>
            <p className="text-xs text-blue-600 mt-1">active holders at last market day</p>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Market Day Notes</p>
              {notesDirty && <span className="text-xs text-gray-400">Saving…</span>}
            </div>
            <textarea
              rows={7}
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              disabled={!canEdit}
              placeholder={canEdit ? 'Add notes for this market day…' : 'No notes recorded'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default"
            />
          </div>

        </div>
      </div>
    </div>
  )
}
