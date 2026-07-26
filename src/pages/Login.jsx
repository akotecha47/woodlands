import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getDefaultRoute } from '../lib/roles'
import { DEACTIVATED_MESSAGE } from '../components/RouteGuard'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Set when GuardedPage bounced a deactivated user back here.
  const [error, setError] = useState(location.state?.message ?? null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, is_active')
      .eq('id', data.user.id)
      .single()

    // Stop a deactivated account at the door rather than letting it hold a
    // live session and bounce off GuardedPage on every navigation.
    if (profile?.is_active === false) {
      await supabase.auth.signOut()
      setError(DEACTIVATED_MESSAGE)
      setLoading(false)
      return
    }

    navigate(getDefaultRoute(profile?.role), { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-8">
        <div className="mb-8 text-center">
          <h1 className="font-brand text-2xl font-bold text-gray-900">Woodlands Lodge</h1>
          <p className="text-sm text-gray-500 mt-1">Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-teal hover:bg-brand-teal-dark text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
