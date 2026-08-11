export const ALL_STAFF_ROLES = [
  'owner', 'manager', 'kitchen_manager', 'restaurant_manager',
]

// Generic "owner or manager" gate — the default management permission,
// used as-is across Inventory, Events, and Attendance's stricter (non-
// restaurant_manager) controls. Sites that already had their own named
// module constant (AT_/TB_/FM_MANAGE_ROLES below) keep it, even where the
// value is currently identical, so a Phase 2 role change to one module
// doesn't silently change another.
export const MANAGER_ROLES = ['owner', 'manager']

// Owner only — Admin > Staff create/edit/deactivate actions.
export const OWNER_ONLY_ROLES = ['owner']

// Attendance module: gates Today/History/Settings tab content and the
// default-tab logic in src/pages/Attendance.jsx. Wider than MANAGER_ROLES —
// includes restaurant_manager.
export const AT_MANAGE_ROLES = ['owner', 'manager', 'restaurant_manager']

// Attendance: the restaurant_manager-only tab layout (Today + Clock In/Out,
// no History/Settings) in src/pages/Attendance.jsx. A single-role set kept
// distinct from AT_MANAGE_ROLES so the two attendance permission levels stay
// independently editable.
export const RESTAURANT_MANAGER_ROLES = ['restaurant_manager']

// Table Bookings module: manage actions (check-in, create, edit bookings).
export const TB_MANAGE_ROLES = ['owner', 'manager', 'restaurant_manager']

// Farmers Market module: check-in, add/manage holders, monthly messages,
// market day management.
export const FM_MANAGE_ROLES = ['owner', 'manager']

export const ROUTE_ACCESS = {
  '/dashboard':      ALL_STAFF_ROLES,
  // Inventory is mounted at '/' in App.jsx:39, and Sidebar.jsx:8 lists it as
  // '/'. This key was '/inventory', for which no <Route> exists, so
  // ROUTE_ACCESS['/'] was undefined, GuardedPage took its !allowed branch and
  // redirected every role to /login — making the whole Inventory module
  // unreachable and hiding its nav link. AUDIT_2 §2.5(a).
  // The keys here must match the paths in App.jsx exactly.
  '/':               ALL_STAFF_ROLES,
  '/attendance':     ['owner', 'manager'],
  '/events':         ['owner', 'manager'],
  '/table-bookings': ['owner', 'manager', 'restaurant_manager'],
  '/farmers-market': ['owner', 'manager'],
  '/admin':          OWNER_ONLY_ROLES,
}

export const ROLE_LABELS = {
  owner:              'Owner',
  manager:            'Manager',
  kitchen_manager:    'Kitchen Manager',
  restaurant_manager: 'Restaurant Manager',
}

export function getDefaultRoute(role) {
  if (['owner', 'manager', 'kitchen_manager'].includes(role)) return '/dashboard'
  if (role === 'restaurant_manager') return '/table-bookings'
  return '/dashboard'
}
