// All roles that can log in to the system
export const ALL_STAFF_ROLES = [
  'owner', 'manager', 'restaurant_manager', 'store_supervisor',
  'bar1', 'bar2', 'farmers_market_admin',
  'waiter', 'head_waiter', 'kitchen_staff',
  'housekeeping', 'grounds', 'security',
]

export const ROUTE_ACCESS = {
  '/dashboard':      ['owner', 'manager'],
  '/':               ['owner', 'manager', 'store_supervisor', 'bar1', 'bar2'],
  '/attendance':     ALL_STAFF_ROLES,
  '/events':         ['owner', 'manager'],
  '/table-bookings': ['owner', 'manager', 'restaurant_manager', 'bar1', 'bar2', 'head_waiter', 'waiter'],
  '/farmers-market': ['owner', 'manager', 'farmers_market_admin'],
  '/admin':          ['owner'],
}

export const ROLE_LABELS = {
  owner:                'Owner',
  manager:              'Manager',
  store_supervisor:     'Store Supervisor',
  bar1:                 'Bar 1',
  bar2:                 'Bar 2',
  restaurant_manager:   'Restaurant Manager',
  farmers_market_admin: 'Market Admin',
  waiter:               'Waiter',
  head_waiter:          'Head Waiter',
  kitchen_staff:        'Kitchen Staff',
  housekeeping:         'Housekeeping',
  grounds:              'Grounds',
  security:             'Security',
}

export function getDefaultRoute(role) {
  if (['owner', 'manager'].includes(role)) return '/dashboard'
  if (['store_supervisor', 'bar1', 'bar2'].includes(role)) return '/'
  if (['restaurant_manager', 'head_waiter', 'waiter'].includes(role)) return '/table-bookings'
  if (role === 'farmers_market_admin') return '/farmers-market'
  return '/attendance'
}
