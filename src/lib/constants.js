export const UNITS = ['kg', 'g', 'litres', 'ml', 'units', 'portions', 'boxes', 'bags', 'bottles', 'cans']

// ── Two-tier inventory (migration 051) ──────────────────────────────────────
// Stock balances are keyed by (item, location). A location is either the
// reserved store below or a department name.
//
// MAIN_STORE is a stock LOCATION, never a department: it is deliberately not a
// row in the `departments` table, so it can never appear in the Add-User
// department dropdown (AddUserTab reads that table). Composing the location
// list in code — rather than adding a stock_locations table — keeps
// `departments` the single source of department names. Reconciling three
// vocabularies that had drifted apart is what scripts/data-ops/003 and 004
// spent a session doing; a fourth is not worth the convenience.
export const MAIN_STORE = 'Main Store'

// Sub-locations sit INSIDE a location. Laundry is part of Housekeeping, not a
// department of its own.
export const SUB_LOCATIONS = { Housekeeping: ['Laundry'] }

// Departments come from the DB; the reserved store is prepended.
export const stockLocations = departments => [MAIN_STORE, ...departments.map(d => d.name)]

// FALLBACK ONLY — fm_fee_schedule (migration 061) is authoritative. Load it via
// fetchFeeSchedule() in src/lib/fm.js; these values exist so a screen can paint
// before that resolves.
//
// CORRECTED 18 August 2026 against Dhiren's confirmed schedule. The previous
// id_card_standard 5000 / id_card_extra 10000 / reprint 10000 were WRONG, not
// merely stale — the real fees are 30,000 for ID cards inclusive of two, and
// 20,000 for a replacement. They had drifted unnoticed because nothing
// reconciled this object against anything.
export const FM_FEES = {
  application:     10000,  // Application fee
  acceptance:      20000,  // Business registration fee
  visit:           10000,  // Market day visit fee
  id_card_initial: 30000,  // ID cards — covers the FIRST TWO cards, not one
  id_card_replace: 20000,  // Replacement card
  product_change:  10000,  // Raised by change_holder_products(), never invoiced by hand
}

// Dhiren confirmed six fees. A THIRD or later ID card is not among them: 30,000
// covers two, and nothing states the price of card 3+. Charged at the
// replacement rate until he says otherwise — flagged in WOODLANDS_FOLLOWUPS.md
// rather than quietly invented.
export const FM_ID_CARD_EXTRA_FEE = FM_FEES.id_card_replace
