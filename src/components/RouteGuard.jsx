import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ROUTE_ACCESS } from '../lib/roles'

export function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />

  return children
}

export function GuardedPage({ children }) {
  const { profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return null

  const allowed = ROUTE_ACCESS[location.pathname]
  if (!allowed || !profile || !allowed.includes(profile.role)) {
    return <Navigate to="/login" replace />
  }

  return children
}
