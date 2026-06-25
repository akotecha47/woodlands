export const ALL_STAFF_ROLES = [
  'owner', 'manager', 'kitchen_manager', 'restaurant_manager',
]

export const ROUTE_ACCESS = {
  '/dashboard':      ['owner', 'manager', 'kitchen_manager', 'restaurant_manager'],
  '/inventory':      ['owner', 'manager', 'kitchen_manager', 'restaurant_manager'],
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
