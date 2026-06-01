import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import TodayTab      from '../components/attendance/TodayTab'
import ClockInOutTab from '../components/attendance/ClockInOutTab'
import HistoryTab    from '../components/attendance/HistoryTab'
import SettingsTab   from '../components/attendance/SettingsTab'

export default function Attendance() {
  const { profile } = useAuth()
  const role = profile?.role

  const TABS = (() => {
    if (role === 'owner' || role === 'manager') {
      return [
        { id: 'today',    label: 'Today'    },
        { id: 'history',  label: 'History'  },
        { id: 'settings', label: 'Settings' },
      ]
    }
    if (role === 'restaurant_manager') {
      return [
        { id: 'today', label: 'Today'          },
        { id: 'clock', label: 'Clock In / Out' },
      ]
    }
    return [{ id: 'clock', label: 'Clock In / Out' }]
  })()

  const [tab, setTab] = useState(role === 'owner' || role === 'manager' || role === 'restaurant_manager' ? 'today' : 'clock')

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
        {tab === 'clock'    && <ClockInOutTab />}
        {tab === 'history'  && <HistoryTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}
