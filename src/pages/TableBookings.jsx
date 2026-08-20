import { useState } from 'react'
import { PageHeader, Tabs, Card } from '../components/ui/kit'
import TodayTab       from '../components/table-bookings/TodayTab'
import UpcomingTab    from '../components/table-bookings/UpcomingTab'
import NewBookingTab  from '../components/table-bookings/NewBookingTab'
import AllBookingsTab from '../components/table-bookings/AllBookingsTab'

const TABS = [
  { id: 'today',    label: 'Today'        },
  { id: 'upcoming', label: 'Upcoming'     },
  { id: 'new',      label: 'New Booking'  },
  { id: 'all',      label: 'All Bookings' },
]

export default function TableBookings() {
  const [tab, setTab] = useState('today')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Restaurant"
        title="Table Bookings"
        subtitle="Reservations for the restaurant — today's service, what is coming, and the full record."
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
