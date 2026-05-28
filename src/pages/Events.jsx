import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import EventsListTab  from '../components/events/EventsListTab'
import CreateEventTab from '../components/events/CreateEventTab'
import EventDetailTab from '../components/events/EventDetailTab'

export default function Events() {
  const { profile } = useAuth()
  const canCreate = ['owner', 'manager'].includes(profile?.role)

  const [tab,       setTab]       = useState('list')
  const [eventId,   setEventId]   = useState(null)
  const [eventName, setEventName] = useState('')

  function viewEvent(id, name) {
    setEventId(id)
    setEventName(name || 'Event Detail')
    setTab('detail')
  }

  function handleCreated() {
    setTab('list')
  }

  const TABS = [
    { id: 'list',   label: 'Events' },
    { id: 'create', label: 'Create Event' },
    ...(eventId ? [{ id: 'detail', label: eventName }] : []),
  ]

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-gray-900">Events</h1>

      <div className="flex gap-1 overflow-x-auto bg-gray-100 p-1 rounded-xl w-fit max-w-full">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">
        {tab === 'list'   && <EventsListTab  onView={viewEvent} />}
        {tab === 'create' && <CreateEventTab onCreated={handleCreated} />}
        {tab === 'detail' && eventId && (
          <EventDetailTab
            eventId={eventId}
            onBack={() => setTab('list')}
          />
        )}
      </div>
    </div>
  )
}
