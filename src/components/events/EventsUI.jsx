import { supabaseAdmin } from '../../lib/supabaseAdmin'

// ── constants ──────────────────────────────────────────────────

export const EVENT_TYPES = [
  { value: 'wedding',        label: 'Wedding'       },
  { value: 'conference',     label: 'Conference'    },
  { value: 'birthday',       label: 'Birthday'      },
  { value: 'corporate',      label: 'Corporate'     },
  { value: 'private_dinner', label: 'Private Dinner'},
  { value: 'other',          label: 'Other'         },
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

export async function fetchAllActiveStaff() {
  const { data } = await supabaseAdmin
    .from('user_profiles')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name')
  return data ?? []
}

export async function generateBEO(eventId) {
  const rows = DEPT_ORDER.flatMap(dept =>
    BEO_TASKS[dept].map(task => ({ event_id: eventId, department: dept, task }))
  )
  const { error } = await supabaseAdmin.from('event_checklists').insert(rows)
  if (error) throw error
}
