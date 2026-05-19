// Which roles can access each route path
export const ROUTE_ACCESS = {
  '/':               ['owner', 'manager', 'store_supervisor', 'head_of_department', 'barman', 'kitchen_staff'],
  '/attendance':     ['owner', 'manager', 'head_of_department', 'housekeeping', 'grounds', 'security'],
  '/events':         ['owner', 'manager'],
  '/table-bookings': ['owner', 'manager', 'barman', 'head_waiter', 'waiter'],
  '/farmers-market': ['owner', 'manager', 'farmers_market_admin'],
  '/admin':          ['owner'],
}

// Redirect destination after login, based on role
export function getDefaultRoute(role) {
  const order = ['/', '/attendance', '/table-bookings', '/farmers-market', '/events']
  for (const path of order) {
    if (ROUTE_ACCESS[path]?.includes(role)) return path
  }
  return '/'
}

export const ROLE_LABELS = {
  owner:                'Owner',
  manager:              'Manager',
  store_supervisor:     'Store Supervisor',
  head_of_department:   'Head of Department',
  barman:               'Barman',
  head_waiter:          'Head Waiter',
  waiter:               'Waiter',
  kitchen_staff:        'Kitchen Staff',
  housekeeping:         'Housekeeping',
  grounds:              'Grounds',
  security:             'Security',
  farmers_market_admin: 'Farmers Market Admin',
}

export const ALL_ROLES = Object.keys(ROLE_LABELS)
