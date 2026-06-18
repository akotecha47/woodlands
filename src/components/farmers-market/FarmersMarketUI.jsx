// ── constants ──────────────────────────────────────────────────────────────────

export const STALL_TYPES = ['Produce', 'Crafts', 'Food & Beverages', 'Clothing', 'Other']

export const FM_PAY_METHODS = [
  { value: 'cash',          label: 'Cash'          },
  { value: 'bank_transfer', label: 'Bank Transfer'  },
  { value: 'tnm_mpamba',    label: 'TNM Mpamba'    },
  { value: 'airtel_money',  label: 'Airtel Money'  },
]

export const FM_PAY_TYPES = [
  { value: 'application', label: 'Application Fee',  amount: 10000 },
  { value: 'acceptance',  label: 'Registration Fee', amount: 20000 },
  { value: 'visit',       label: 'Visit Fee',        amount: 10000 },
  { value: 'id_card',     label: 'ID Card'                         },
  { value: 'reprint',     label: 'Reprint'                         },
]

export const HOLDER_STATUS_CFG = {
  pending_review: { label: 'Pending Review', badge: 'bg-yellow-100 text-yellow-700' },
  accepted:       { label: 'Accepted',       badge: 'bg-blue-100 text-blue-700'    },
  active:         { label: 'Active',         badge: 'bg-green-100 text-green-700'  },
  inactive:       { label: 'Inactive',       badge: 'bg-gray-100 text-gray-500'    },
  at_risk:        { label: 'At Risk',        badge: 'bg-red-100 text-red-700'      },
}

// Roles allowed to check in on market day
export const FM_MANAGE_ROLES = ['owner', 'manager']

// ── date helpers ───────────────────────────────────────────────────────────────

export const todayStr = () => new Date().toISOString().slice(0, 10)

function toDateStr(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

// Returns 'YYYY-MM-DD' string for last Saturday of the given month (0-indexed)
export function getLastSaturdayOfMonth(year, month) {
  const lastDay = new Date(year, month + 1, 0)
  const offset  = (lastDay.getDay() - 6 + 7) % 7
  lastDay.setDate(lastDay.getDate() - offset)
  return toDateStr(lastDay)
}

export function defaultMarketDate() {
  const now = new Date()
  return getLastSaturdayOfMonth(now.getFullYear(), now.getMonth())
}

// Returns array of the last n last-Saturdays-of-month that are <= today
export function getLastNMarketDays(n) {
  const result = []
  const today  = new Date()
  let year  = today.getFullYear()
  let month = today.getMonth()
  let safety = 0
  while (result.length < n && safety < 36) {
    const dateStr = getLastSaturdayOfMonth(year, month)
    if (new Date(dateStr + 'T12:00:00') <= today) result.push(dateStr)
    month--
    if (month < 0) { month = 11; year-- }
    safety++
  }
  return result
}

// Returns all last-Saturdays-of-month from sinceTs onwards up to today, newest first
export function getMarketDaysSince(sinceTs) {
  if (!sinceTs) return []
  const result = []
  const today  = new Date()
  const since  = new Date(sinceTs)
  let year  = since.getFullYear()
  let month = since.getMonth()
  let safety = 0
  while (safety < 120) {
    const dateStr = getLastSaturdayOfMonth(year, month)
    const d = new Date(dateStr + 'T12:00:00')
    if (d > today) break
    if (d >= since) result.push(dateStr)
    month++
    if (month > 11) { month = 0; year++ }
    safety++
  }
  return result.reverse()
}

// Handles both date-only 'YYYY-MM-DD' and full timestamptz
export function fmtDate(ts) {
  if (!ts) return '—'
  const d = String(ts).length <= 10 ? new Date(ts + 'T12:00:00') : new Date(ts)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtMWK(n) {
  return `MWK ${Number(n || 0).toLocaleString('en-US')}`
}

// ── shared UI ──────────────────────────────────────────────────────────────────

export function HolderStatusBadge({ status }) {
  const cfg = HOLDER_STATUS_CFG[status]
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg?.badge ?? 'bg-gray-100 text-gray-500'}`}>
      {cfg?.label ?? status}
    </span>
  )
}

export function PaidIcon({ paid }) {
  return paid
    ? <span className="text-xs font-medium text-green-600">✓ Yes</span>
    : <span className="text-xs text-gray-400">—</span>
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
