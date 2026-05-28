import { useState } from 'react'
import EventsListTab  from '../components/events/EventsListTab'
import CreateEventTab from '../components/events/CreateEventTab'
import EventDetailTab from '../components/events/EventDetailTab'

const TABS = [
  { id: 'list',   label: 'Events'       },
  { id: 'create', label: 'Create Event' },
]

export default function Events() {
  const [tab,            setTab]            = useState('list')
  const [viewingEventId, setViewingEventId] = useState(null)

  function handleTabChange(id) {
    setTab(id)
    setViewingEventId(null)
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-gray-900">Events</h1>

      <div className="flex gap-1 overflow-x-auto bg-gray-100 p-1 rounded-xl w-fit max-w-full">
        {TABS.map(t => (
          <button key={t.id} onClick={() => handleTabChange(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">
        {tab === 'list' && !viewingEventId && (
          <EventsListTab onView={id => setViewingEventId(id)} />
        )}
        {tab === 'list' && viewingEventId && (
          <EventDetailTab
            eventId={viewingEventId}
            onBack={() => setViewingEventId(null)}
          />
        )}
        {tab === 'create' && (
          <CreateEventTab onCreated={() => handleTabChange('list')} />
        )}
      </div>
    </div>
  )
}
