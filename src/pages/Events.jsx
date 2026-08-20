import { useState } from 'react'
import { PageHeader, Tabs, Card } from '../components/ui/kit'
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Functions"
        title="Events"
        subtitle="Enquiries through to completed functions — the brief, the staffing, the stock, the bill and the payments."
      />

      <Tabs tabs={TABS} value={tab} onChange={handleTabChange} ariaLabel="Events sections" />

      <Card className="overflow-hidden">
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
      </Card>
    </div>
  )
}
