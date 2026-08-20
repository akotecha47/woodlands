/**
 * THE NAV MAP — the one list of destinations, and the two helpers that read it.
 *
 * Split out of Sidebar.jsx so that file exports a component and nothing else
 * (React Fast Refresh; see src/components/ui/kit.constants.js for the same
 * reasoning). It is also the honest home for this list, because TopBar's
 * jump-to-section box consumes it too — the sidebar is no longer its only
 * caller.
 *
 * ROLE SCOPING IS MIRRORED, NOT DECIDED HERE. `navItemsForRole` filters on the
 * same ROUTE_ACCESS map that RouteGuard enforces, so no surface built on this
 * list can offer a route the guard would bounce — and none can widen one
 * either. Both the sidebar nav and the top bar's jump list go through it.
 */

import {
  LayoutDashboard, Package, Clock, Calendar, BookOpen, Leaf, Settings,
} from 'lucide-react'
import { ROUTE_ACCESS } from '../lib/roles'

export const NAV_ITEMS = [
  { path: '/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { path: '/',               label: 'Inventory',      icon: Package  },
  { path: '/attendance',     label: 'Attendance',     icon: Clock    },
  { path: '/events',         label: 'Events',         icon: Calendar },
  { path: '/table-bookings', label: 'Table Bookings', icon: BookOpen },
  { path: '/farmers-market', label: 'Farmers Market', icon: Leaf     },
  { path: '/admin',          label: 'Admin',          icon: Settings },
]

export function navItemsForRole(role) {
  return NAV_ITEMS.filter(item => ROUTE_ACCESS[item.path]?.includes(role))
}

export function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}
