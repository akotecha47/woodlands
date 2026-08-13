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

export const FM_FEES = {
  application:      10000,
  acceptance:       20000,
  visit:            10000,
  id_card_standard:  5000,
  id_card_extra:    10000,
  reprint:          10000,
}
