import { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { useAuth } from '../../contexts/AuthContext'
import { Toast, useFlash } from '../admin/AdminUI'
import {
  EVENT_TYPES, STATUS_CFG, DEPT_ORDER,
  fmtDate, fmtTime,
  EventStatusBadge, generateBEO,
} from './EventsUI'
import EventBillSection    from './EventBillSection'
import EventPaymentsSection from './EventPaymentsSection'

export default function EventDetailTab({ eventId, onBack }) {
  const { profile, session } = useAuth()
  const canManage = ['owner', 'manager'].includes(profile?.role)

  const [event,      setEvent]      = useState(null)
  const [checklists, setChecklists] = useState([])
  const [billItems,  setBillItems]  = useState([])
  const [userMap,    setUserMap]    = useState({})
  const [loading,    setLoading]    = useState(true)
  const [toast,      setToast]      = useState(null)
  const flash = useFlash(setToast)

  async function load() {
    setLoading(true)
    const [evtR, clR, billR, profilesR] = await Promise.all([
      supabaseAdmin.from('events').select('*').eq('id', eventId).single(),
      supabaseAdmin.from('event_checklists').select('*')
        .eq('event_id', eventId).order('department').order('created_at'),
      supabaseAdmin.from('event_bill_items').select('*')
        .eq('event_id', eventId).order('created_at'),
      supabaseAdmin.from('user_profiles').select('id, full_name'),
    ])
    const evt = evtR.data
    let cls = clR.data ?? []

    // Auto-generate BEO if event is confirmed/in_progress but has no checklists
    if (evt && ['confirmed', 'in_progress'].includes(evt.status) && cls.length === 0) {
      await generateBEO(eventId)
      const clR2 = await supabaseAdmin.from('event_checklists').select('*')
        .eq('event_id', eventId).order('department').order('created_at')
      cls = clR2.data ?? []
    }

    if (evt)            setEvent(evt)
    setChecklists(cls)
    if (billR.data)     setBillItems(billR.data)
    if (profilesR.data) {
      const map = {}
      for (const u of profilesR.data) map[u.id] = u.full_name
      setUserMap(map)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [eventId])

  async function changeStatus(newStatus) {
    try {
      if (newStatus === 'confirmed' && checklists.length === 0) {
        await generateBEO(eventId)
      }
      const { error } = await supabaseAdmin.from('events')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', eventId)
      if (error) throw error
      // Update event state immediately so buttons reflect the new status before the full reload
      setEvent(prev => ({ ...prev, status: newStatus }))
      flash(`Status → ${STATUS_CFG[newStatus]?.label ?? newStatus}`)
      load()
    } catch (err) { flash(err.message, false) }
  }

  async function toggleTask(task, checked) {
    const patch = {
      is_complete:  checked,
      completed_by: checked ? session.user.id : null,
      completed_at: checked ? new Date().toISOString() : null,
    }
    try {
      const { error } = await supabaseAdmin
        .from('event_checklists').update(patch).eq('id', task.id)
      if (error) throw error
      setChecklists(cs => cs.map(c => c.id === task.id ? { ...c, ...patch } : c))
    } catch (err) { flash(err.message, false) }
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>
  if (!event)  return <div className="p-6 text-sm text-gray-400">Event not found.</div>

  // Group checklists by department
  const byDept = DEPT_ORDER.reduce((acc, d) => ({ ...acc, [d]: [] }), {})
  for (const c of checklists) {
    const d = c.department ?? 'Other'
    if (!byDept[d]) byDept[d] = []
    byDept[d].push(c)
  }

  const totalTasks  = checklists.length
  const doneTasks   = checklists.filter(c => c.is_complete).length
  const overallPct  = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0
  const billTotal   = billItems.reduce((s, i) => s + Number(i.amount), 0)
  const eventType   = EVENT_TYPES.find(t => t.value === event.event_type)?.label ?? event.event_type
  const timeDisplay = [fmtTime(event.start_time), fmtTime(event.end_time)].filter(Boolean).join(' – ')

  return (
    <div className="p-6 space-y-8">
      <Toast toast={toast} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button onClick={onBack}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-2">
            <ChevronLeft size={14} /> Back to Events
          </button>
          <h2 className="text-xl font-semibold text-gray-900">{event.name}</h2>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <EventStatusBadge status={event.status} />
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
              event.deposit_paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {event.deposit_paid ? 'Deposit Paid' : 'Deposit Unpaid'}
            </span>
            {totalTasks > 0 && (
              <span className="text-xs text-gray-500">{doneTasks}/{totalTasks} tasks</span>
            )}
          </div>
        </div>

        {/* Status pipeline */}
        {canManage && (
          <div className="flex gap-2 flex-wrap">
            {event.status === 'enquiry' && (
              <button onClick={() => changeStatus('confirmed')}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                Confirm Event
              </button>
            )}
            {event.status === 'confirmed' && (
              <button onClick={() => changeStatus('in_progress')}
                className="px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
                Start Event
              </button>
            )}
            {event.status === 'in_progress' && (
              <button onClick={() => changeStatus('completed')}
                className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg">
                Complete Event
              </button>
            )}
            {!['completed', 'cancelled'].includes(event.status) && (
              <button onClick={() => changeStatus('cancelled')}
                className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg">
                Cancel Event
              </button>
            )}
          </div>
        )}
      </div>

      {/* Event info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 bg-gray-50 rounded-xl p-5 text-sm">
        {[
          ['Type',      eventType],
          ['Date',      fmtDate(event.event_date)],
          ['Time',      timeDisplay || null],
          ['Guests',    event.guest_count],
          ['Venue',     event.venue_area],
          ['Organiser', event.organiser_name],
          ['Contact',   event.organiser_contact],
          ['Email',     event.organiser_email],
          ['Created',   fmtDate(event.created_at)],
        ].filter(([, val]) => val != null && val !== '').map(([label, val]) => (
          <div key={label} className="flex gap-2">
            <span className="text-gray-500 w-24 shrink-0">{label}</span>
            <span className="text-gray-900 font-medium break-all">{val}</span>
          </div>
        ))}
        {event.special_requirements && (
          <div className="col-span-full flex gap-2">
            <span className="text-gray-500 w-24 shrink-0">Special Req.</span>
            <span className="text-gray-700">{event.special_requirements}</span>
          </div>
        )}
        {event.notes && (
          <div className="col-span-full flex gap-2">
            <span className="text-gray-500 w-24 shrink-0">Notes</span>
            <span className="text-gray-700">{event.notes}</span>
          </div>
        )}
      </div>

      {/* BEO Checklists */}
      {checklists.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-semibold text-gray-800">BEO Checklists</h3>
            <span className="text-sm text-gray-500">{overallPct}% complete</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-5">
            <div className="bg-green-600 h-2 rounded-full transition-all" style={{ width: `${overallPct}%` }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {DEPT_ORDER.filter(d => byDept[d]?.length > 0).map(dept => {
              const tasks = byDept[dept]
              const dDone = tasks.filter(t => t.is_complete).length
              const dPct  = tasks.length > 0 ? Math.round(dDone / tasks.length * 100) : 0
              return (
                <div key={dept} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-sm font-semibold text-gray-800">{dept}</h4>
                    <span className="text-xs text-gray-500">{dDone}/{tasks.length}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
                    <div className="bg-green-600 h-1.5 rounded-full transition-all" style={{ width: `${dPct}%` }} />
                  </div>
                  <div className="space-y-2.5">
                    {tasks.map(task => (
                      <div key={task.id} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={task.is_complete}
                          onChange={e => toggleTask(task, e.target.checked)}
                          className="mt-0.5 rounded border-gray-300 text-green-600 focus:ring-green-600 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <p className={`text-sm leading-snug ${task.is_complete ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {task.task}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {task.due_time && (
                              <span className="text-xs text-gray-400">Due {fmtTime(task.due_time)}</span>
                            )}
                            {task.assigned_to && (
                              <span className="text-xs text-blue-500">→ {userMap[task.assigned_to] ?? '—'}</span>
                            )}
                            {task.is_complete && task.completed_by && (
                              <span className="text-xs text-gray-400">
                                ✓ {userMap[task.completed_by] ?? '—'}
                                {task.completed_at && ` · ${fmtDate(task.completed_at)}`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        event.status === 'enquiry' && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
            BEO checklists will be auto-generated when this event is confirmed.
          </div>
        )
      )}

      {/* Bill */}
      <EventBillSection
        eventId={eventId}
        items={billItems}
        canManage={canManage}
        onRefresh={load}
      />

      {/* Payments */}
      <EventPaymentsSection
        eventId={eventId}
        billTotal={billTotal}
        canManage={canManage}
      />
    </div>
  )
}
