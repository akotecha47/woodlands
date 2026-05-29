// All roles that can log in to the system
export const ALL_STAFF_ROLES = [
  'owner', 'manager', 'restaurant_manager', 'store_supervisor',
  'bar1', 'bar2', 'farmers_market_admin',
  'waiter', 'head_waiter', 'kitchen_staff',
  'housekeeping', 'grounds', 'security',
]

export const ROUTE_ACCESS = {
  '/':               ['owner', 'manager', 'store_supervisor', 'bar1', 'bar2'],
  '/attendance':     ALL_STAFF_ROLES,
  '/events':         ['owner', 'manager'],
  '/table-bookings': ['owner', 'manager', 'restaurant_manager', 'bar1', 'bar2'],
  '/farmers-market': ['owner', 'manager', 'farmers_market_admin'],
  '/admin':          ['owner'],
}

export const ROLE_LABELS = {
  owner:               'Owner',
  manager:             'Manager',
  store_supervisor:    'Store Supervisor',
  bar1:                'Bar 1',
  bar2:                'Bar 2',
  restaurant_manager:   'Restaurant Manager',
  farmers_market_admin: 'Market Admin',
}

export function getDefaultRoute(role) {
  if (role === 'restaurant_manager') return '/attendance'
  return '/'
}
