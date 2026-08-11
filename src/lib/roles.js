// Woodlands login roles — Phase 2 role model (11 August 2026).
//
//   manager            -> admin            (renamed; access widened to every
//                                           module. Only /admin stays owner-only)
//   kitchen_manager    -> department_head  (Kitchen)
//   restaurant_manager -> department_head  (Restaurant)
//   department_head, hr                    (new)
//
// The database enforces the same four values through public.current_app_role()
// and the policies in migrations 037-042. `supabase/functions/create-user/
// index.ts` carries a hand-synced duplicate of this list because Deno cannot
// import a browser module — change both together (standards.md §9).
export const APP_ROLES = ['owner', 'admin', 'department_head', 'hr']

// owner + admin — the full-management set, and the default gate for a module
// write. Replaces the old `MANAGER_ROLES` (owner + manager); renamed because a
// constant named after a deleted role is exactly the drift standards.md §9
// exists to prevent.
export const MANAGE_ROLES = ['owner', 'admin']

// Owner only — the Admin page and every control on it.
export const OWNER_ONLY_ROLES = ['owner']

// Attendance module. hr owns the roster, so it manages attendance alongside
// owner/admin. department_head is deliberately excluded: attendance is NOT
// department-scoped in this phase.
export const AT_MANAGE_ROLES = ['owner', 'admin', 'hr']

// Table Bookings module.
export const TB_MANAGE_ROLES = ['owner', 'admin']

// Farmers Market module. hr and department_head have no Farmers Market access.
export const FM_MANAGE_ROLES = ['owner', 'admin']

// Inventory module reach. department_head sees its own department's stock and
// can raise a requisition; approve/fulfil and all stock writes stay
// MANAGE_ROLES. The scoping itself is enforced in RLS (migration 038) — this
// constant only decides who the router lets onto the page.
export const INVENTORY_VIEW_ROLES = ['owner', 'admin', 'department_head']

export const ROUTE_ACCESS = {
  '/dashboard':      APP_ROLES,
  // Inventory is mounted at '/' in App.jsx:39, and Sidebar.jsx:8 lists it as
  // '/'. This key was '/inventory', for which no <Route> exists, so
  // ROUTE_ACCESS['/'] was undefined, GuardedPage took its !allowed branch and
  // redirected every role to /login — making the whole Inventory module
  // unreachable and hiding its nav link. AUDIT_2 §2.5(a).
  // The keys here must match the paths in App.jsx exactly.
  '/':               INVENTORY_VIEW_ROLES,
  '/attendance':     AT_MANAGE_ROLES,
  '/events':         MANAGE_ROLES,
  '/table-bookings': TB_MANAGE_ROLES,
  '/farmers-market': FM_MANAGE_ROLES,
  '/admin':          OWNER_ONLY_ROLES,
}

export const ROLE_LABELS = {
  owner:           'Owner',
  admin:           'Admin',
  department_head: 'Department Head',
  hr:              'HR',
}

// Every role reaches /dashboard, so it is the single landing route — the old
// restaurant_manager -> /table-bookings special case died with the role.
// An unrecognised role goes to /login, which is where GuardedPage would send
// it on the next navigation anyway.
export function getDefaultRoute(role) {
  return APP_ROLES.includes(role) ? '/dashboard' : '/login'
}
