import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  REVENUE_READINGS, REVENUE_READING_KEY, DEFAULT_READING, isReading,
} from '../../lib/revenue'

// ── constants ──────────────────────────────────────────────────

export const EVENT_TYPES = [
  { value: 'wedding',        label: 'Wedding'       },
  { value: 'conference',     label: 'Conference'    },
  { value: 'birthday',       label: 'Birthday'      },
  { value: 'corporate',      label: 'Corporate'     },
  { value: 'private_dinner', label: 'Private Dinner'},
  { value: 'other',          label: 'Other'         },
]

export const SERVICE_STYLES = [
  { value: 'buffet',               label: 'Buffet'               },
  { value: 'plated_table_service', label: 'Plated Table Service' },
  { value: 'cocktail',             label: 'Cocktail Reception'   },
  { value: 'family_style',         label: 'Family Style'         },
  { value: 'other',                label: 'Other'                },
]

export const CONFERENCE_SETUPS = [
  { value: 'not_applicable', label: 'Not Applicable' },
  { value: 'classroom',      label: 'Classroom'      },
  { value: 'theatre',        label: 'Theatre'        },
  { value: 'boardroom',      label: 'Boardroom'      },
  { value: 'u_shape',        label: 'U-Shape'        },
  { value: 'cabaret',        label: 'Cabaret'        },
  { value: 'other',          label: 'Other'          },
]

export const VENUES = ['Main Hall', 'Garden', 'Pool Deck', 'Restaurant', 'Other']

export const PAY_METHODS = [
  { value: 'cash',          label: 'Cash'          },
  { value: 'card',          label: 'Card'          },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'tnm_mpamba',    label: 'TNM Mpamba'    },
  { value: 'airtel_money',  label: 'Airtel Money'  },
]

export const PAY_TYPES = [
  { value: 'deposit',    label: 'Deposit'    },
  { value: 'balance',    label: 'Balance'    },
  { value: 'additional', label: 'Additional' },
  { value: 'refund',     label: 'Refund'     },
]

export const EVENT_STATUSES = [
  { value: 'enquiry',     label: 'Enquiry'     },
  { value: 'confirmed',   label: 'Confirmed'   },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed'   },
  { value: 'cancelled',   label: 'Cancelled'   },
]

export const STATUS_CFG = {
  enquiry:     { label: 'Enquiry',     badge: 'bg-gray-100 text-gray-600'   },
  confirmed:   { label: 'Confirmed',   badge: 'bg-blue-100 text-blue-700'   },
  in_progress: { label: 'In Progress', badge: 'bg-amber-100 text-amber-700' },
  completed:   { label: 'Completed',   badge: 'bg-green-100 text-green-700' },
  cancelled:   { label: 'Cancelled',   badge: 'bg-red-100 text-red-700'     },
}

export const DEPT_ORDER = ['Kitchen', 'Bar', 'Grounds', 'Front Desk']

export const BEO_TASKS = {
  Kitchen: [
    'Confirm guest count with organiser',
    'Confirm menu and dietary requirements',
    'Complete stock check for event ingredients',
    'Prepare and stage kitchen stations',
    'Brief kitchen team on event timeline',
    'Post-event kitchen clean-down',
  ],
  Bar: [
    'Confirm beverage package with organiser',
    'Complete stock check for bar requirements',
    'Raise stock requisition if needed',
    'Setup and stage bar area',
    'Brief bar team on service timing',
    'Post-event bar clean-down and restock',
  ],
  Grounds: [
    'Confirm venue area layout with manager',
    'Setup tables, chairs, and linens',
    'Arrange lighting and decorations per brief',
    'Inspect and prepare guest pathways',
    'Post-event grounds clean-up and reset',
  ],
  'Front Desk': [
    'Confirm final guest count 48hrs before event',
    'Prepare guest welcome materials',
    'Brief front desk team on arrival schedule',
    'Coordinate parking and guest flow',
    'Collect post-event organiser feedback',
  ],
}

// ── helpers ────────────────────────────────────────────────────

export const todayStr = () => new Date().toISOString().slice(0, 10)

// Handles both date-only strings ("2026-05-28") and full timestamptz
export function fmtDate(ts) {
  if (!ts) return '—'
  const d = String(ts).length <= 10 ? new Date(ts + 'T12:00:00') : new Date(ts)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Time column from DB ("14:30:00") → "14:30"
export function fmtTime(t) {
  if (!t) return null
  return String(t).slice(0, 5)
}

export function fmtMWK(n) {
  return `MWK ${Number(n || 0).toLocaleString('en-US')}`
}

// ── shared UI ──────────────────────────────────────────────────

export function EventStatusBadge({ status }) {
  const cfg = STATUS_CFG[status]
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg?.badge ?? 'bg-gray-100 text-gray-600'}`}>
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

export function EmptyRow({ cols, msg = 'No records found' }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-8 text-center text-sm text-gray-400">{msg}</td>
    </tr>
  )
}

// ── DB helpers ─────────────────────────────────────────────────

// The 62-row staff roster. These ids are NOT user ids — `staff` is disjoint
// from user_profiles/auth.users with no FK between them.
//
// Do NOT use this to populate a picker for any `*_by` column. Those FK to
// auth.users(id) or user_profiles(id), and a staff.id fails the constraint.
// That is exactly what broke Event Add Payment from 28 May to 26 July 2026
// (see WOODLANDS_FOLLOWUPS.md). Use user_profiles for attribution fields;
// use this only where a roster member is genuinely meant, e.g. assigning
// staff to work an event.
export async function fetchAllActiveStaff() {
  const { data } = await supabase
    .from('staff')
    .select('id, full_name, department, position')
    .eq('is_active', true)
    .order('full_name')
  return data ?? []
}

export async function generateBEO(eventId) {
  const rows = DEPT_ORDER.flatMap(dept =>
    BEO_TASKS[dept].map(task => ({ event_id: eventId, department: dept, task }))
  )
  const { error } = await supabase.from('event_checklists').insert(rows)
  if (error) throw error
}

// ── revenue reading ────────────────────────────────────────────

/**
 * The revenue reading, shared across the Events List strip and the Event
 * Detail panel so the two surfaces cannot show two different numbers under one
 * label. Persisted in localStorage rather than lifted into a context: the
 * choice is a viewing preference, it must survive a page reload during the
 * walkthrough, and it is PROVISIONAL — Dhiren picks the real reading on his
 * return (28 August 2026), at which point one reading becomes the only one and
 * this hook goes away with the toggle.
 */
export function useRevenueReading() {
  const [reading, setReading] = useState(() => {
    try {
      const stored = localStorage.getItem(REVENUE_READING_KEY)
      return isReading(stored) ? stored : DEFAULT_READING
    } catch {
      // Private-mode / blocked storage. A viewing preference is never worth
      // failing a page render for.
      return DEFAULT_READING
    }
  })

  function choose(next) {
    if (!isReading(next)) return
    setReading(next)
    try { localStorage.setItem(REVENUE_READING_KEY, next) } catch { /* see above */ }
  }

  return [reading, choose]
}

/** The reading picker. One control, used by both surfaces. */
export function RevenueReadingPicker({ reading, onChange, size = 'md' }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
      {REVENUE_READINGS.map(r => (
        <button
          key={r.value}
          type="button"
          title={r.blurb}
          onClick={() => onChange(r.value)}
          className={`${size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'} rounded-md font-medium transition-colors ${
            reading === r.value
              ? 'bg-white text-brand-teal shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}>
          {r.label}
        </button>
      ))}
    </div>
  )
}

/**
 * The provisional-reading warning. Deliberately not dismissible and deliberately
 * on every revenue surface: the whole point of shipping three readings is that
 * nobody mistakes the default for a decision.
 */
export function ProvisionalRevenueNote({ className = '' }) {
  return (
    <p className={`text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 ${className}`}>
      <strong>Provisional reading.</strong> "Revenue should be different" was raised on 27 July
      and never made specific. Three readings are shown so the number can be chosen rather than
      guessed — Dhiren picks one on his return, and the other two are removed.
    </p>
  )
}
