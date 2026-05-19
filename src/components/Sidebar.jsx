import { NavLink } from 'react-router-dom'
import { Package, Clock, CalendarDays, UtensilsCrossed, ShoppingBasket, TreePine, X } from 'lucide-react'

const navItems = [
  { label: 'Inventory',       to: '/',                icon: Package,          end: true },
  { label: 'Attendance',      to: '/attendance',      icon: Clock },
  { label: 'Events',          to: '/events',          icon: CalendarDays },
  { label: 'Table Bookings',  to: '/table-bookings',  icon: UtensilsCrossed },
  { label: 'Farmers Market',  to: '/farmers-market',  icon: ShoppingBasket },
]

export default function Sidebar({ open, onClose }) {
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

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 shrink-0">
          <p className="text-[11px] text-gray-400">Lodge Management Demo</p>
        </div>
      </aside>
    </>
  )
}
