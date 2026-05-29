// ── constants ──────────────────────────────────────────────────────────────────

export const AT_MANAGE_ROLES = ['owner', 'manager']

export const LODGE_LAT = -13.9623
export const LODGE_LNG =  33.7852
export const RADIUS_M  =  100

export const STATUS_CFG = {
  present:     { label: 'Present',       badge: 'bg-green-100 text-green-700'  },
  late:        { label: 'Late',          badge: 'bg-amber-100 text-amber-700'  },
  absent:      { label: 'Absent',        badge: 'bg-red-100 text-red-700'      },
  unverified:  { label: 'Unverified',    badge: 'bg-gray-100 text-gray-500'    },
  not_arrived: { label: 'Not Arrived',   badge: 'bg-gray-100 text-gray-400'    },
}

export const ALL_STATUSES = ['present', 'late', 'absent', 'unverified']

// ── GPS helpers ────────────────────────────────────────────────────────────────

export function haversineM(lat1, lng1, lat2, lng2) {
  const R  = 6371000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return }
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
  })
}

// ── date / time helpers ────────────────────────────────────────────────────────

export const todayStr = () => new Date().toISOString().slice(0, 10)

export function fmtDate(val) {
  if (!val) return '—'
  const s = String(val)
  const d = s.length <= 10 ? new Date(s + 'T12:00:00') : new Date(s)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtTime(val) {
  if (!val) return null
  const s = String(val)
  // time-only string "HH:MM:SS" or "HH:MM"
  if (s.length <= 8 && s.includes(':')) return s.slice(0, 5)
  return new Date(val).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function fmtDuration(totalMins) {
  if (totalMins == null || totalMins < 0) return '—'
  return `${Math.floor(totalMins / 60)}:${String(totalMins % 60).padStart(2, '0')}`
}

export function breakMins(rec) {
  if (!rec?.break_start || !rec?.break_end) return 0
  return Math.max(0, Math.round((new Date(rec.break_end) - new Date(rec.break_start)) / 60000))
}

export function netMins(rec, nowDate) {
  if (!rec?.clock_in) return null
  const end   = rec.clock_out ? new Date(rec.clock_out) : (nowDate ?? new Date())
  const gross = Math.round((end - new Date(rec.clock_in)) / 60000)
  return Math.max(0, gross - breakMins(rec))
}

// ── shift helpers ──────────────────────────────────────────────────────────────

// Returns the best-matching shift_settings row for a given department and current state.
export function getShiftForDept(department, shifts, currentWeek, nowDate) {
  if (!department) return null
  const deptShifts = shifts.filter(s => s.department === department)
  if (deptShifts.length === 0) return null

  // Rotating bar shifts — pick by current week
  const rotating = deptShifts.filter(s => s.shift_type === 'rotating')
  if (rotating.length > 0) {
    return rotating.find(s => s.shift_name === `Week ${currentWeek}`) ?? rotating[0]
  }

  // Single shift
  if (deptShifts.length === 1) return deptShifts[0]

  // Multiple standard shifts — pick whichever window contains now
  const now = nowDate ?? new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const match = deptShifts.find(s => {
    const [sh, sm] = s.shift_start.split(':').map(Number)
    const [eh, em] = s.shift_end.split(':').map(Number)
    return nowMins >= sh * 60 + sm && nowMins <= eh * 60 + em
  })
  return match ?? deptShifts[0]
}

export function isLate(clockInTs, shift) {
  if (!clockInTs || !shift) return false
  const [sh, sm] = shift.shift_start.split(':').map(Number)
  const threshold = (shift.late_threshold ?? 15)
  const shiftStart = new Date(clockInTs)
  shiftStart.setHours(sh, sm + threshold, 0, 0)
  return new Date(clockInTs) > shiftStart
}

// ── shared UI ──────────────────────────────────────────────────────────────────

export function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status]
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg?.badge ?? 'bg-gray-100 text-gray-400'}`}>
      {cfg?.label ?? status ?? '—'}
    </span>
  )
}

export function AccessDenied() {
  return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        Access denied. You don't have permission to view this section.
      </div>
    </div>
  )
}
