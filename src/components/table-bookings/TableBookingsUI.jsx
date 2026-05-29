export const TB_MANAGE_ROLES = ['owner', 'manager', 'restaurant_manager']

export const STATUS_CFG = {
  pending:   { label: 'Pending',   badge: 'bg-yellow-100 text-yellow-700' },
  confirmed: { label: 'Confirmed', badge: 'bg-blue-100 text-blue-700'    },
  seated:    { label: 'Seated',    badge: 'bg-green-100 text-green-700'  },
  completed: { label: 'Completed', badge: 'bg-gray-100 text-gray-600'    },
  cancelled: { label: 'Cancelled', badge: 'bg-red-100 text-red-700'      },
  no_show:   { label: 'No Show',   badge: 'bg-amber-100 text-amber-700'  },
}

export const BOOKING_STATUSES = Object.keys(STATUS_CFG)

export const LOCATIONS = ['Indoor', 'Outdoor', 'Terrace', 'Private Room']

export const todayStr = () => new Date().toISOString().slice(0, 10)

export function currentTimeStr() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtTime(timeStr) {
  if (!timeStr) return '—'
  return String(timeStr).slice(0, 5)
}

// Flag confirmed bookings where booking time was > 45 min ago (same or past date)
export function isPotentialNoShow(booking) {
  if (booking.status !== 'confirmed') return false
  const today = todayStr()
  if (booking.booking_date > today) return false
  if (booking.booking_date < today) return true
  const now = new Date()
  const [hh, mm] = String(booking.booking_time).split(':').map(Number)
  const bkTime = new Date()
  bkTime.setHours(hh, mm, 0, 0)
  return (now - bkTime) > 45 * 60 * 1000
}

export function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status]
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg?.badge ?? 'bg-gray-100 text-gray-500'}`}>
      {cfg?.label ?? status}
    </span>
  )
}

export function AccessDenied() {
  return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        Access denied. You don't have permission to use this feature.
      </div>
    </div>
  )
}
