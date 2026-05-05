import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'

const pageTitles = {
  '/':             'Inventory',
  '/attendance':   'Attendance',
  '/housekeeping': 'Housekeeping',
  '/revenue':      'Revenue',
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const title = pageTitles[pathname] ?? 'Woodlands'

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — offset by sidebar width on large screens */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Top bar (mobile only) */}
        <header className="sticky top-0 z-10 flex items-center h-16 px-4 bg-white border-b border-gray-200 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Open sidebar"
          >
            <Menu size={20} />
          </button>
          <span className="ml-3 text-base font-semibold text-gray-900">{title}</span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
