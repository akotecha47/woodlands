import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ROUTE_ACCESS } from '../lib/roles'

export const DEACTIVATED_MESSAGE = 'Your account has been deactivated. Contact the owner.'

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

  // Deactivation has to revoke access, not just grey out a badge in Admin.
  // Checked before the role check so a deactivated owner is locked out too.
  // `!== false` rather than truthiness: a profile predating 005 may have
  // is_active NULL, and those users are not deactivated. Mirrors
  // public.current_app_role() (migration 021), which applies the same test
  // in SQL so the database enforces this independently of the router.
  if (profile && profile.is_active === false) {
    return <Navigate to="/login" replace state={{ message: DEACTIVATED_MESSAGE }} />
  }

  const allowed = ROUTE_ACCESS[location.pathname]
  if (!allowed || !profile || !allowed.includes(profile.role)) {
    return <Navigate to="/login" replace />
  }

  return children
}
