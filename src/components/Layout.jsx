import { useState } from 'react'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay — tapping it closes the drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Hamburger top bar — only visible below md */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-700 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-300 hover:text-white transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span className="font-bold text-white tracking-wide text-sm">Woodlands</span>
        </div>

        <main className="flex-1 bg-gray-50 overflow-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
