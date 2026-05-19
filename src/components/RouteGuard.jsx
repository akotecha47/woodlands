import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getDefaultRoute } from '../lib/roles'

// ─── RequireAuth ──────────────────────────────────────────────────────────────
// Wrap any route tree that requires an authenticated session.
// Shows a spinner while auth is resolving; redirects to /login when unauthenticated.

export function RequireAuth() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-6 h-6 rounded-full border-2 border-[#16a34a] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return <Outlet />
}

// ─── GuardedPage ──────────────────────────────────────────────────────────────
// Wrap a page component with an allowed-roles list.
// Renders the page when the user's role is permitted; shows AccessDenied otherwise.

export function GuardedPage({ allowed, children }) {
  const { profile } = useAuth()

  if (!profile || !allowed.includes(profile.role)) {
    return <AccessDenied />
  }

  return children
}

// ─── AccessDenied ─────────────────────────────────────────────────────────────

function AccessDenied() {
  const { profile } = useAuth()
  const location = useLocation()
  const defaultRoute = getDefaultRoute(profile?.role)

  // If already on the default route (shouldn't happen, but guard against loops)
  if (location.pathname === defaultRoute) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-gray-500 text-sm">No accessible pages for your role. Contact an admin.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <span className="text-red-600 text-xl font-bold">!</span>
      </div>
      <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
      <p className="mt-1 text-sm text-gray-500 max-w-xs">
        You don't have permission to view this page.
      </p>
      <a
        href={defaultRoute}
        className="mt-4 text-sm font-medium text-[#16a34a] hover:text-[#15803d] hover:underline"
      >
        Go to your dashboard
      </a>
    </div>
  )
}
