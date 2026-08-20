import { PageHeader, Tabs, Card } from '../components/ui/kit'
import { sectionsFor } from '../lib/sections'
import { useSectionTab } from '../lib/useSectionTab'
import TodayTab       from '../components/table-bookings/TodayTab'
import UpcomingTab    from '../components/table-bookings/UpcomingTab'
import NewBookingTab  from '../components/table-bookings/NewBookingTab'
import AllBookingsTab from '../components/table-bookings/AllBookingsTab'

const TABS = sectionsFor('/table-bookings')

export default function TableBookings() {
  const [tab, setTab] = useSectionTab('today')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Restaurant"
        title="Table Bookings"
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Table Bookings sections" />

      <Card className="overflow-hidden">
        {tab === 'today'    && <TodayTab />}
        {tab === 'upcoming' && <UpcomingTab />}
        {tab === 'new'      && <NewBookingTab />}
        {tab === 'all'      && <AllBookingsTab />}
      </Card>
    </div>
  )
}
