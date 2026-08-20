import { Check } from 'lucide-react'
import { Badge } from '../ui/kit'

// ── constants ──────────────────────────────────────────────────────────────────

export const STALL_TYPES = ['Produce', 'Crafts', 'Food & Beverages', 'Clothing', 'Other']

// ── stall numbers ──────────────────────────────────────────────────────────────
// THREE digits, not two. Every one of the 305 live stalls is A001-A347 (verified
// against production 18 Aug 2026: 305/305 match ^[A-Za-z]+\d{3}$, 0 two-digit).
// AddHolderTab enforced /^[A-Za-z]+\d{2}$/ until now, so no real stall number
// could be entered through the form at all, and HoldersTab's Edit enforced
// nothing. One rule, defined once, used by both.
export const STALL_RE = /^[A-Za-z]+\d{3}$/

export const STALL_FORMAT_HINT = 'Stall number must be a letter prefix then three digits — e.g. A001, A347, FM012.'

// Returns '' when valid, otherwise the message to show. Normalise with toUpperCase() first.
export function validateStall(value) {
  return STALL_RE.test((value ?? '').trim().toUpperCase()) ? '' : STALL_FORMAT_HINT
}

export const FM_PAY_METHODS = [
  { value: 'cash',          label: 'Cash'          },
  { value: 'bank_transfer', label: 'Bank Transfer'  },
  { value: 'tnm_mpamba',    label: 'TNM Mpamba'    },
  { value: 'airtel_money',  label: 'Airtel Money'  },
]

// LABELS ONLY. These carried an `amount` each until Block 3 / C, which made
// this a fourth copy of the fee schedule that nothing reconciled. Amounts come
// from fm_fee_schedule through useFeeSchedule() at the point of charge; the
// `fee` key maps a payment TYPE to its fee CODE, which is not always the same
// word (a 'reprint' payment is the 'id_card_replace' fee).
export const FM_PAY_TYPES = [
  { value: 'application',    label: 'Application Fee',  fee: 'application'     },
  { value: 'acceptance',     label: 'Registration Fee', fee: 'acceptance'      },
  { value: 'visit',          label: 'Visit Fee',        fee: 'visit'           },
  { value: 'id_card',        label: 'ID Card',          fee: 'id_card_initial' },
  { value: 'reprint',        label: 'Reprint',          fee: 'id_card_replace' },
  { value: 'product_change', label: 'Product Change',   fee: 'product_change'  },
]

export const HOLDER_STATUS_CFG = {
  pending_review: { label: 'Pending Review', tone: 'warn'    },
  accepted:       { label: 'Accepted',       tone: 'brand'   },
  active:         { label: 'Active',         tone: 'ok'      },
  inactive:       { label: 'Inactive',       tone: 'neutral' },
  at_risk:        { label: 'At Risk',        tone: 'alert'   },
  forfeited:      { label: 'Forfeited',      tone: 'neutral' },
}

// Role gates (FM_MANAGE_ROLES etc.) live in src/lib/roles.js, not here.

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

// Returns the market day date string for the given month, or null if December (no market)
export function getMarketDayForMonth(year, month) {
  if (month === 11) return null
  return getLastSaturdayOfMonth(year, month)
}

// Returns true if dateStr (defaults to today) is the last Saturday of a non-December month
export function isMarketDay(dateStr = null) {
  const d  = dateStr ? new Date(dateStr + 'T12:00:00') : new Date()
  const md = getMarketDayForMonth(d.getFullYear(), d.getMonth())
  if (!md) return false
  return toDateStr(d) === md
}

export function defaultMarketDate() {
  const now   = new Date()
  // If December, fall back to November — there is no December market day
  const month = now.getMonth() === 11 ? 10 : now.getMonth()
  return getLastSaturdayOfMonth(now.getFullYear(), month)
}

// Returns array of the last n market days (last Saturday of non-December month) that are <= today
export function getLastNMarketDays(n) {
  const result = []
  const today  = new Date()
  let year  = today.getFullYear()
  let month = today.getMonth()
  let safety = 0
  while (result.length < n && safety < 36) {
    if (month !== 11) {
      const dateStr = getLastSaturdayOfMonth(year, month)
      if (new Date(dateStr + 'T12:00:00') <= today) result.push(dateStr)
    }
    month--
    if (month < 0) { month = 11; year-- }
    safety++
  }
  return result
}

// Returns all market days (non-December) from sinceTs onwards up to today, newest first
export function getMarketDaysSince(sinceTs) {
  if (!sinceTs) return []
  const result = []
  const today  = new Date()
  const since  = new Date(sinceTs)
  let year  = since.getFullYear()
  let month = since.getMonth()
  let safety = 0
  while (safety < 120) {
    if (month !== 11) {
      const dateStr = getLastSaturdayOfMonth(year, month)
      const d = new Date(dateStr + 'T12:00:00')
      if (d > today) break
      if (d >= since) result.push(dateStr)
    }
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
  return <Badge tone={cfg?.tone ?? 'neutral'}>{cfg?.label ?? status}</Badge>
}

export function PaidIcon({ paid }) {
  return paid
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
        <Check size={13} aria-hidden="true" />Yes
      </span>
    : <span className="text-xs text-gray-400">—</span>
}

export { AccessDenied } from '../ui/kit'
