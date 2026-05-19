import { NavLink } from 'react-router-dom'
import { Package, Clock, CalendarDays, UtensilsCrossed, ShoppingBasket, Settings, TreePine, X, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ROLE_LABELS } from '../lib/roles'

const ALL_NAV_ITEMS = [
  {
    label: 'Inventory',
    to: '/',
    icon: Package,
    end: true,
    allowed: ['owner', 'manager', 'store_supervisor', 'head_of_department', 'barman', 'kitchen_staff'],
  },
  {
    label: 'Attendance',
    to: '/attendance',
    icon: Clock,
    allowed: ['owner', 'manager', 'head_of_department', 'housekeeping', 'grounds', 'security'],
  },
  {
    label: 'Events',
    to: '/events',
    icon: CalendarDays,
    allowed: ['owner', 'manager'],
  },
  {
    label: 'Table Bookings',
    to: '/table-bookings',
    icon: UtensilsCrossed,
    allowed: ['owner', 'manager', 'barman', 'head_waiter', 'waiter'],
  },
  {
    label: 'Farmers Market',
    to: '/farmers-market',
    icon: ShoppingBasket,
    allowed: ['owner', 'manager', 'farmers_market_admin'],
  },
  {
    label: 'Admin',
    to: '/admin',
    icon: Settings,
    allowed: ['owner'],
  },
]

export default function Sidebar({ open, onClose }) {
  const { profile, signOut } = useAuth()
  const role = profile?.role ?? ''

  const navItems = ALL_NAV_ITEMS.filter(item => item.allowed.includes(role))

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-white border-r border-gray-200',
          'transition-transform duration-200 ease-in-out',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]">
              <TreePine size={18} className="text-white" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-gray-900">
              Woodlands
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Management
          </p>
          {navItems.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#16a34a] text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={17} className={isActive ? 'text-white' : 'text-gray-400'} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer — user info + logout */}
        <div className="px-4 py-4 border-t border-gray-200 shrink-0">
          {profile ? (
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#16a34a]/10 text-[#16a34a] font-semibold text-xs shrink-0 uppercase">
                {profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate">{profile.full_name}</p>
                <p className="text-[11px] text-gray-400 truncate">{ROLE_LABELS[profile.role] ?? profile.role}</p>
              </div>
              <button
                onClick={signOut}
                title="Sign out"
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-gray-400">Lodge Management</p>
          )}
        </div>
      </aside>
    </>
  )
}
