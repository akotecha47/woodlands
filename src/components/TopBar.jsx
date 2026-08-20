import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Menu, Search, LogOut, ChevronDown } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ROLE_LABELS } from '../lib/roles'
import { navItemsForRole, getInitials } from './Sidebar.nav'
import { sectionIndexForRole, matchSections } from '../lib/sections'

/**
 * U-02 — the top bar, on EVERY page.
 *
 * Before Block 2 this existed only inside OwnerDashboard, so five of six
 * modules simply had no top bar, and the only sign-out was buried in the
 * sidebar footer. Both are fixed here: one bar, rendered by AppShell, so every
 * route gets the same frame.
 *
 * C-47#5 — the decorative controls are gone:
 *   · the notification bell and its hard-coded red "unread" dot are REMOVED.
 *     Nothing in this system produces a notification, so an unread indicator
 *     was a claim the screen could not deliver.
 *   · the search pill was a `cursor-default` div. It is now a real control:
 *     a jump-to-section box over the destinations THIS ROLE can reach. It
 *     navigates and nothing else — it runs no query and reads no data, and the
 *     placeholder says so.
 */
export default function TopBar({ onOpenMenu }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const role = profile?.role ?? ''

  const navItems = navItemsForRole(role)
  const current = navItems.find(d =>
    d.path === '/' ? location.pathname === '/' : location.pathname.startsWith(d.path))

  // E — the index reaches IN-MODULE TABS, not just the seven routes. It was
  // top-level only, so "bus" (Farmers Market > Businesses) matched nothing and
  // the box quietly taught people it did not work. Same ROUTE_ACCESS filter as
  // the sidebar, so nothing is widened: a tab is offered only where its module
  // already is.
  const destinations = sectionIndexForRole(role, navItems)

  const [query,     setQuery]     = useState('')
  const [openList,  setOpenList]  = useState(false)
  const [cursor,    setCursor]    = useState(0)
  const [menuOpen,  setMenuOpen]  = useState(false)
  const searchRef = useRef(null)
  const menuRef   = useRef(null)

  const matches = matchSections(destinations, query)

  // Click-away for both poppers.
  useEffect(() => {
    function onDocClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setOpenList(false)
      if (menuRef.current   && !menuRef.current.contains(e.target))   setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // `state.tab` is what lets a hit land on the TAB rather than on the module
  // and whatever tab it happens to open on. Module-level hits pass null and the
  // page keeps its own default.
  function go(dest) {
    setQuery('')
    setOpenList(false)
    navigate(dest.path, dest.tab ? { state: { tab: dest.tab } } : undefined)
  }

  function onSearchKey(e) {
    if (e.key === 'Escape')      { setOpenList(false); e.currentTarget.blur(); return }
    if (e.key === 'ArrowDown')   { e.preventDefault(); setOpenList(true); setCursor(c => Math.min(c + 1, matches.length - 1)); return }
    if (e.key === 'ArrowUp')     { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); return }
    if (e.key === 'Enter' && matches[cursor]) { e.preventDefault(); go(matches[cursor]) }
  }

  // Sign-out must actually end the session. AuthContext.signOut clears the
  // local session even when the server call fails; the navigate is belt and
  // braces on top of RequireAuth's own redirect.
  async function handleSignOut() {
    setMenuOpen(false)
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur-sm border-b border-line">
      <div className="max-w-[1440px] mx-auto flex items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">

        <button
          onClick={onOpenMenu}
          className="md:hidden text-ink-soft hover:text-navy wl-transition shrink-0"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Breadcrumb — where you are, on every page. */}
        <nav aria-label="Breadcrumb" className="min-w-0 flex items-center gap-2">
          <span className="hidden sm:inline text-[13px] text-gray-400">Woodlands</span>
          <span className="hidden sm:inline text-gray-300" aria-hidden="true">/</span>
          <span className="text-[13px] font-bold text-navy truncate">
            {current?.label ?? 'Woodlands'}
          </span>
        </nav>

        <div className="flex-1" />

        {/* Jump-to-section. Navigation only. */}
        <div ref={searchRef} className="relative hidden sm:block w-56 lg:w-72">
          <Search size={14} aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            role="combobox"
            aria-expanded={openList}
            aria-controls="topbar-jump-list"
            aria-label="Jump to a section"
            value={query}
            placeholder="Jump to a section…"
            onFocus={() => { setOpenList(true); setCursor(0) }}
            onChange={e => { setQuery(e.target.value); setOpenList(true); setCursor(0) }}
            onKeyDown={onSearchKey}
            className="w-full bg-white border border-line rounded-lg pl-9 pr-3 py-2 text-[13px] text-ink
                       placeholder:text-gray-400 wl-transition hover:border-gray-300
                       focus:border-teal focus:ring-2 focus:ring-teal/25"
          />
          {openList && (
            <ul
              id="topbar-jump-list"
              role="listbox"
              className="absolute right-0 mt-2 w-full min-w-[19rem] bg-white border border-line rounded-xl shadow-lg py-1.5 max-h-[60vh] overflow-y-auto"
            >
              {matches.length === 0 && (
                <li className="px-3 py-2.5 text-[13px] text-ink-soft">
                  No section matches “{query}”.
                </li>
              )}
              {matches.map((d, i) => {
                const Icon = d.icon
                return (
                  <li key={d.key} role="option" aria-selected={i === cursor}>
                    <button
                      type="button"
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => go(d)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left wl-transition ${
                        i === cursor ? 'bg-teal-tint text-teal-deep' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Icon size={14} className="shrink-0 text-gray-400" aria-hidden="true" />
                      {/* A bare "Today" is ambiguous — Attendance and Table
                          Bookings both have one. The module qualifies it. */}
                      {d.module && (
                        <span className="text-gray-400 shrink-0">{d.module} ›</span>
                      )}
                      <span className="font-semibold truncate">{d.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Who you are, and the way out. */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-transparent hover:border-line hover:bg-white wl-transition"
          >
            <span
              className="w-8 h-8 rounded-full bg-teal flex items-center justify-center text-white text-[11px] font-bold select-none"
              aria-hidden="true"
            >
              {getInitials(profile?.full_name)}
            </span>
            <span className="hidden lg:block text-[13px] font-semibold text-navy max-w-[9rem] truncate">
              {profile?.full_name ?? '—'}
            </span>
            <ChevronDown size={14} className="text-gray-400" aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-60 bg-white border border-line rounded-xl shadow-lg overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-line">
                <p className="text-[13px] font-bold text-navy truncate">
                  {profile?.full_name ?? '—'}
                </p>
                <p className="text-xs text-ink-soft mt-0.5">{ROLE_LABELS[role] ?? role}</p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 wl-transition text-left"
              >
                <LogOut size={15} className="text-gray-400" aria-hidden="true" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
