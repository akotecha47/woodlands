import { useState } from 'react'
import { PageHeader, Tabs, Card } from '../components/ui/kit'
import { sectionsFor } from '../lib/sections'
import { useSectionTab } from '../lib/useSectionTab'
import EventsListTab  from '../components/events/EventsListTab'
import CreateEventTab from '../components/events/CreateEventTab'
import EventDetailTab from '../components/events/EventDetailTab'

const TABS = sectionsFor('/events')

export default function Events() {
  const [tab,            setTab]            = useSectionTab('list')
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
