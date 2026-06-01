import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, Clock, Calendar, BookOpen, Leaf, Settings, LogOut, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ROUTE_ACCESS, ROLE_LABELS } from '../lib/roles'

const NAV_ITEMS = [
  { path: '/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { path: '/',               label: 'Inventory',      icon: Package  },
  { path: '/attendance',     label: 'Attendance',     icon: Clock    },
  { path: '/events',         label: 'Events',         icon: Calendar },
  { path: '/table-bookings', label: 'Table Bookings', icon: BookOpen },
  { path: '/farmers-market', label: 'Farmers Market', icon: Leaf     },
  { path: '/admin',          label: 'Admin',          icon: Settings },
]

export default function Sidebar({ open, onClose }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role ?? ''

  const visibleItems = NAV_ITEMS.filter(
    item => ROUTE_ACCESS[item.path]?.includes(role)
  )

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <aside className={[
      // Base
      'w-56 bg-brand-navy text-white flex flex-col shrink-0 overflow-y-auto',
      // Mobile: fixed drawer
      'fixed inset-y-0 left-0 z-30 transition-transform duration-200',
      // Desktop: back in flow, always visible
      'md:static md:inset-auto md:z-auto md:translate-x-0 md:min-h-screen',
      open ? 'translate-x-0' : '-translate-x-full',
    ].join(' ')}>

      {/* Header */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
        <span className="font-bold text-base text-white tracking-wide">Woodlands</span>
        <button
          onClick={onClose}
          className="md:hidden text-white/50 hover:text-white transition-colors"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-teal text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-sm font-medium text-white truncate">
          {profile?.full_name ?? '—'}
        </p>
        <p className="text-xs text-white/50 mt-0.5">
          {ROLE_LABELS[role] ?? role}
        </p>
        <button
          onClick={handleSignOut}
          className="mt-3 flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
