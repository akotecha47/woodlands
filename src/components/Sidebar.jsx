import { NavLink, useNavigate } from 'react-router-dom'
import { Package, Clock, Calendar, BookOpen, Leaf, Settings, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ROUTE_ACCESS, ROLE_LABELS } from '../lib/roles'

const NAV_ITEMS = [
  { path: '/',               label: 'Inventory',      icon: Package  },
  { path: '/attendance',     label: 'Attendance',     icon: Clock    },
  { path: '/events',         label: 'Events',         icon: Calendar },
  { path: '/table-bookings', label: 'Table Bookings', icon: BookOpen },
  { path: '/farmers-market', label: 'Farmers Market', icon: Leaf     },
  { path: '/admin',          label: 'Admin',          icon: Settings },
]

export default function Sidebar() {
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
    <aside className="w-56 min-h-screen bg-gray-900 text-gray-100 flex flex-col shrink-0">
      <div className="px-5 py-5 border-b border-gray-700">
        <span className="font-bold text-base text-white tracking-wide">Woodlands</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-green-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-gray-700">
        <p className="text-sm font-medium text-white truncate">
          {profile?.full_name ?? '—'}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {ROLE_LABELS[role] ?? role}
        </p>
        <button
          onClick={handleSignOut}
          className="mt-3 flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
