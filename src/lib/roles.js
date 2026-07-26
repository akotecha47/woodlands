export const ALL_STAFF_ROLES = [
  'owner', 'manager', 'kitchen_manager', 'restaurant_manager',
]

export const ROUTE_ACCESS = {
  '/dashboard':      ['owner', 'manager', 'kitchen_manager', 'restaurant_manager'],
  // Inventory is mounted at '/' in App.jsx:39, and Sidebar.jsx:8 lists it as
  // '/'. This key was '/inventory', for which no <Route> exists, so
  // ROUTE_ACCESS['/'] was undefined, GuardedPage took its !allowed branch and
  // redirected every role to /login — making the whole Inventory module
  // unreachable and hiding its nav link. AUDIT_2 §2.5(a).
  // The keys here must match the paths in App.jsx exactly.
  '/':               ['owner', 'manager', 'kitchen_manager', 'restaurant_manager'],
  '/attendance':     ['owner', 'manager'],
  '/events':         ['owner', 'manager'],
  '/table-bookings': ['owner', 'manager', 'restaurant_manager'],
  '/farmers-market': ['owner', 'manager'],
  '/admin':          ['owner'],
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
