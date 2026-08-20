import { NavLink } from 'react-router-dom'
import { X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ROLE_LABELS } from '../lib/roles'
import { navItemsForRole, getInitials } from './Sidebar.nav'
import streamlineLogo from '../assets/streamline-s.svg'

/**
 * The one sidebar. Navy, brand block at the top, role-scoped nav, the person
 * and the quiet Streamline signature at the foot.
 *
 * ROLE SCOPING IS MIRRORED, NOT DECIDED HERE. `navItemsForRole` (in
 * ./Sidebar.nav.js, shared with TopBar's jump list) filters on the same
 * ROUTE_ACCESS map that RouteGuard enforces, so the nav can never offer a
 * route the guard would bounce — and can never widen one either.
 */

export default function Sidebar({ open, onClose }) {
  const { profile } = useAuth()
  const role = profile?.role ?? ''
  const visibleItems = navItemsForRole(role)

  return (
    <aside
      className={[
        'w-64 bg-navy text-white flex flex-col shrink-0 overflow-y-auto',
        'fixed inset-y-0 left-0 z-40 transition-transform duration-200',
        'md:static md:inset-auto md:z-auto md:translate-x-0 md:h-screen md:sticky md:top-0',
        open ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}
    >
      {/* ── Brand ─────────────────────────────────────────────────────────
          The S-mark, the wordmark, and what the product is. Woodlands owns
          the product; Streamline signs it at the foot, not here. */}
      <div className="px-5 pt-6 pb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={streamlineLogo}
            alt=""
            aria-hidden="true"
            className="h-[38px] w-auto shrink-0 select-none"
          />
          <div className="min-w-0">
            <p className="text-[17px] font-bold text-white leading-none tracking-[-.01em]">
              Woodlands
            </p>
            <p className="text-[9.5px] font-semibold uppercase tracking-[.16em] text-white/45 mt-1.5">
              Lodge Management
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="md:hidden text-white/50 hover:text-white wl-transition -mr-1"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <div className="mx-5 border-t border-white/10" />

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold wl-transition',
                isActive
                  ? 'bg-teal text-white shadow-glow'
                  : 'text-white/65 hover:bg-white/10 hover:text-white',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={16} className={isActive ? 'text-white' : 'text-white/55'} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Who you are ───────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-[11px] font-bold text-white shrink-0 select-none"
            aria-hidden="true"
          >
            {getInitials(profile?.full_name)}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white truncate">
              {profile?.full_name ?? '—'}
            </p>
            <p className="text-[11px] text-white/45 mt-0.5">
              {ROLE_LABELS[role] ?? role}
            </p>
          </div>
        </div>
      </div>

      {/* ── The signature ─────────────────────────────────────────────────── */}
      <div className="px-5 pb-5 pt-1">
        <div className="flex items-center gap-2 opacity-40">
          <img src={streamlineLogo} alt="" aria-hidden="true" className="h-[15px] w-auto" />
          <span className="text-[10.5px] font-medium text-white tracking-wide">
            Built by Streamline
          </span>
        </div>
      </div>
    </aside>
  )
}
