import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getDefaultRoute } from '../lib/roles'
import { DEACTIVATED_MESSAGE } from '../components/RouteGuard'

// U-11: staff sign in with a plain name -- "rose", not "rose@woodlands.com".
//
// Nothing about the stored identity changes. There is no username column on
// user_profiles and no alternate auth path; sign-in is
// supabase.auth.signInWithPassword with an email, and all 8 live accounts are
// @woodlands.com (verified against auth.users). So the whole fix is here, in
// the browser, on the typed string: if what was typed has no '@', the known
// domain is appended before the call. Anyone who types a full address -- an
// owner with an outside address, a future account on another domain -- is
// passed through untouched, so this narrows nothing.
const LOGIN_DOMAIN = '@woodlands.com'

function toEmail(typed) {
  const v = (typed ?? '').trim()
  return v.includes('@') ? v : (v && v + LOGIN_DOMAIN)
}

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

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: toEmail(email),
      password,
    })
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
              Username
            </label>
            {/* type="text", not "email": the browser's own validation on
                type="email" rejects a bare "rose" before submit ever runs. */}
            <input
              type="text"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              placeholder="rose"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
            />
            <p className="text-xs text-gray-400 mt-1">
              Just your name — no need to type {LOGIN_DOMAIN}
            </p>
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
