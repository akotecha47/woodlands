import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

/**
 * THE SHELL. One frame, every route.
 *
 * Before Block 2 the frame was three different things: Layout gave a hamburger
 * strip below `md` and nothing above it, OwnerDashboard drew its own top bar
 * that no other page had, and each module page set its own padding. That is
 * most of what made the system read as assembled rather than designed.
 *
 * Now: sidebar + top bar + one content frame with one max-width and one
 * padding rhythm, so no page is its own margin.
 */
export default function AppShell({ children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen flex bg-paper">
      {/* Mobile scrim */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-navy-900/50 z-30 md:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />

        {/* The content frame. `key` on the route resets scroll position
            between modules, which the old shell did not do. */}
        <main
          key={location.pathname}
          className="flex-1 max-w-[1440px] w-full mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
