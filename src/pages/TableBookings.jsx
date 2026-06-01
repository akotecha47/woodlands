import { useState } from 'react'
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
    <div className="space-y-5">
      <h1 className="font-brand text-2xl font-semibold text-gray-900">Table Bookings</h1>

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
        {tab === 'today'    && <TodayTab />}
        {tab === 'upcoming' && <UpcomingTab />}
        {tab === 'new'      && <NewBookingTab />}
        {tab === 'all'      && <AllBookingsTab />}
      </div>
    </div>
  )
}
