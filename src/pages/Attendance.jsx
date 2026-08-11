import { useState } from 'react'
import TodayTab    from '../components/attendance/TodayTab'
import HistoryTab  from '../components/attendance/HistoryTab'
import SettingsTab from '../components/attendance/SettingsTab'

// ROUTE_ACCESS['/attendance'] is AT_MANAGE_ROLES (owner, admin, hr), so every
// role that reaches this page manages attendance and gets the same three tabs.
//
// The two branches that used to live here were already dead before Phase 2:
// one required `restaurant_manager` and the other any role outside
// owner/manager, but ROUTE_ACCESS['/attendance'] was ['owner','manager'], so
// GuardedPage bounced both to /login before this component rendered. Their
// only content was a "Clock In / Out" tab, which is why ClockInOutTab has no
// reachable mount point — see WOODLANDS_FOLLOWUPS.md.
const TABS = [
  { id: 'today',    label: 'Today'    },
  { id: 'history',  label: 'History'  },
  { id: 'settings', label: 'Settings' },
]

export default function Attendance() {
  const [tab, setTab] = useState('today')

  return (
    <div className="space-y-5">
      <h1 className="font-brand text-2xl font-semibold text-gray-900">Attendance</h1>

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
        {tab === 'history'  && <HistoryTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}
