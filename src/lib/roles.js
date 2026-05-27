export const ROUTE_ACCESS = {
  '/':               ['owner', 'manager', 'store_supervisor', 'bar1', 'bar2'],
  '/attendance':     ['owner', 'manager', 'restaurant_manager'],
  '/events':         ['owner', 'manager'],
  '/table-bookings': ['owner', 'manager', 'restaurant_manager', 'bar1', 'bar2'],
  '/farmers-market': ['owner', 'manager'],
  '/admin':          ['owner'],
}

export const ROLE_LABELS = {
  owner:               'Owner',
  manager:             'Manager',
  store_supervisor:    'Store Supervisor',
  bar1:                'Bar 1',
  bar2:                'Bar 2',
  restaurant_manager:  'Restaurant Manager',
}

export function getDefaultRoute(role) {
  if (role === 'restaurant_manager') return '/attendance'
  return '/'
}
