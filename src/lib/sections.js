// THE SECTION MAP — every destination in the app, top-level route and in-module
// tab alike, in ONE place.
//
// It exists because the top bar's "Jump to a section" box indexed only the
// seven top-level routes, so typing "bus" — Farmers Market › Businesses, a tab
// people actually live in — matched nothing. A search that silently knows about
// a seventh of the app is worse than no search: it teaches you not to trust it.
//
// SINGLE SOURCE, NOT A SECOND COPY. The module pages build their own tab bars
// from `MODULE_SECTIONS` too, so a tab cannot exist in the search index and not
// on the page, or be renamed on the page and go stale here. The pages still own
// the id -> Component mapping and their own role gates; this file owns only the
// id, the label and the order.
//
// ACCESS IS MIRRORED, NEVER WIDENED. `sectionIndexForRole` filters on
// ROUTE_ACCESS — the same map RouteGuard enforces and the sidebar reads. A tab
// is reachable in search only if its MODULE is reachable, so the box can never
// offer a destination the guard would bounce. Where a module hides tabs from a
// role beyond the route gate (Inventory does, U-12), the page filter still
// applies on arrival and the jump lands on the first tab that role may use.

import { ROUTE_ACCESS, MANAGE_ROLES } from './roles'

export const MODULE_SECTIONS = {
  // `roles` NARROWS a tab below its module's route gate. Only Inventory needs
  // it: a department_head reaches the module but three of its tabs refuse them
  // (U-12), so without this the search box would offer a destination the page
  // then drops them out of. It mirrors the gate each tab component already
  // applies to itself; it never widens one, and a tab with no `roles` simply
  // inherits ROUTE_ACCESS for its module.
  '/': [
    { id: 'stock',        label: 'Stock Levels'    },
    { id: 'delivery',     label: 'Log Delivery',   roles: MANAGE_ROLES },
    { id: 'barcount',     label: 'Bar Count'       },
    { id: 'requisitions', label: 'Requisitions'    },
    { id: 'transfers',    label: 'Transfers',      roles: MANAGE_ROLES },
    { id: 'adjustments',  label: 'Adjustments',    roles: MANAGE_ROLES },
    { id: 'consumption',  label: 'Consumption'     },
    { id: 'log',          label: 'Movement Ledger' },
  ],
  '/attendance': [
    { id: 'today',    label: 'Today'    },
    { id: 'history',  label: 'History'  },
    { id: 'settings', label: 'Settings' },
  ],
  '/events': [
    { id: 'list',   label: 'Events'       },
    { id: 'create', label: 'Create Event' },
  ],
  '/table-bookings': [
    { id: 'today',    label: 'Today'        },
    { id: 'upcoming', label: 'Upcoming'     },
    { id: 'new',      label: 'New Booking'  },
    { id: 'all',      label: 'All Bookings' },
  ],
  '/farmers-market': [
    { id: 'market',   label: 'Market Day'   },
    { id: 'holders',  label: 'Businesses'   },
    { id: 'add',      label: 'Add Business' },
    { id: 'messages', label: 'Messages'     },
    { id: 'payments', label: 'Payments'     },
    { id: 'waiting',  label: 'Waiting List' },
    { id: 'fees',     label: 'Fees'         },
  ],
  '/admin': [
    { id: 'staff',       label: 'Staff'       },
    { id: 'users',       label: 'Users'       },
    { id: 'add_user',    label: 'Add User'    },
    { id: 'departments', label: 'Departments' },
    { id: 'stock_items', label: 'Stock Items' },
    { id: 'rooms',       label: 'Rooms'       },
  ],
}

/** The tab list for one module page. Pages map these ids to their components. */
export function sectionsFor(path) {
  return MODULE_SECTIONS[path] ?? []
}

/**
 * The flat searchable index for one role: every module the role can reach, plus
 * every tab inside it. `module` is carried so a match can be shown as
 * "Farmers Market › Businesses" rather than a bare "Businesses" — there are two
 * "Today"s and two "Payments"-ish tabs in this app, and an unqualified label
 * would make them indistinguishable.
 *
 * `navItems` is passed in rather than imported so this module stays free of the
 * lucide/react-router graph the sidebar pulls in.
 */
export function sectionIndexForRole(role, navItems) {
  const out = []
  for (const item of navItems) {
    if (!ROUTE_ACCESS[item.path]?.includes(role)) continue
    // The module itself first, so "inventory" still lands on the module.
    out.push({
      key:    item.path,
      path:   item.path,
      tab:    null,
      label:  item.label,
      module: null,
      icon:   item.icon,
    })
    for (const s of sectionsFor(item.path)) {
      // A tab may narrow below its module, never widen above it.
      if (s.roles && !s.roles.includes(role)) continue
      out.push({
        key:    item.path + '#' + s.id,
        path:   item.path,
        tab:    s.id,
        label:  s.label,
        module: item.label,
        icon:   item.icon,
      })
    }
  }
  return out
}

/**
 * Match on the tab label, the module name, and the two joined — so "bus"
 * finds Businesses, "fm fees" finds Farmers Market › Fees, and "market day"
 * finds the tab rather than only the module.
 */
export function matchSections(index, query) {
  const q = query.trim().toLowerCase()
  if (!q) return index
  return index.filter(s => {
    const hay = [s.label, s.module, s.module ? s.module + ' ' + s.label : '']
      .filter(Boolean).join(' ').toLowerCase()
    return q.split(/\s+/).every(part => hay.includes(part))
  })
}
