import { supabase } from '../../lib/supabase'
import { Badge } from '../ui/kit'

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

// The types a person may CHOOSE when recording a payment. 'reversal' is
// deliberately absent: a reversal is only ever written by
// reverse_event_payment(), which pairs it with the row it reverses. Offering it
// here would let someone hand-key an unpaired reversal that subtracts from the
// bill and points at nothing.
export const PAY_TYPES = [
  { value: 'deposit',    label: 'Deposit'    },
  { value: 'balance',    label: 'Balance'    },
  { value: 'additional', label: 'Additional' },
  { value: 'refund',     label: 'Refund'     },
]

// Every type that can appear in the ledger, including the ones no form offers.
// Kept separate from PAY_TYPES so a display label can never accidentally become
// a form option.
export const PAY_TYPE_LABELS = {
  ...Object.fromEntries(PAY_TYPES.map(t => [t.value, t.label])),
  reversal: 'Reversal',
}

export function payTypeLabel(v) {
  return PAY_TYPE_LABELS[v] ?? v ?? '—'
}

export const EVENT_STATUSES = [
  { value: 'enquiry',     label: 'Enquiry'     },
  { value: 'confirmed',   label: 'Confirmed'   },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed'   },
  { value: 'cancelled',   label: 'Cancelled'   },
]

// Tones, not class strings — see the kit. Confirmed is `brand` (teal): an
// active state, not a health verdict.
export const STATUS_CFG = {
  enquiry:     { label: 'Enquiry',     tone: 'neutral' },
  confirmed:   { label: 'Confirmed',   tone: 'brand'   },
  in_progress: { label: 'In Progress', tone: 'warn'    },
  completed:   { label: 'Completed',   tone: 'ok'      },
  cancelled:   { label: 'Cancelled',   tone: 'alert'   },
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
  return <Badge tone={cfg?.tone ?? 'neutral'}>{cfg?.label ?? status}</Badge>
}

export { AccessDenied, EmptyRow } from '../ui/kit'

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

// ── revenue ─ REMOVED IN BLOCK 3 ──────────────────────────────
//
// `useRevenueReading`, `RevenueReadingPicker` and `ProvisionalRevenueNote`
// lived here. The client asked to RECORD PAYMENTS, not to track revenue, so
// the three-reading toggle, the 'Recognised' headline and the non-dismissible
// provisional note are all gone from the UI (Block 3 / A).
//
// src/lib/revenue.js is DELIBERATELY KEPT. `summarisePayments` is what the
// Events List now uses for 'Payments Received - This Month' and what nets
// refunds and reversals off a gross; the three reading calculators sitting
// beside it are unreferenced but tested, and deleting a proven calculation to
// tidy an import list is how a decision becomes irreversible. See the report
// for which revenue.test.mjs cases are now obsolete.
