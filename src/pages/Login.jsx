import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getDefaultRoute } from '../lib/roles'
import { DEACTIVATED_MESSAGE } from '../components/RouteGuard'
import { Button, Field, Inp } from '../components/ui/kit'
import streamlineLogo from '../assets/streamline-s.svg'

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
    <div className="min-h-screen flex flex-col lg:flex-row bg-paper">

      {/* The navy half. On a phone it collapses to a slim header band so the
          form is still the first thing in reach. */}
      <div className="lg:w-[42%] bg-navy text-white flex flex-col justify-between px-8 py-8 lg:px-12 lg:py-12">
        <div className="flex items-center gap-3">
          <img src={streamlineLogo} alt="" aria-hidden="true" className="h-[38px] w-auto" />
          <div>
            <p className="text-[17px] font-bold leading-none tracking-[-.01em]">Woodlands</p>
            <p className="text-[9.5px] font-semibold uppercase tracking-[.16em] text-white/45 mt-1.5">
              Lodge Management
            </p>
          </div>
        </div>

        <div className="hidden lg:block max-w-sm">
          <h2 className="text-[30px] font-bold tracking-[-.025em] leading-tight">
            One system for the whole lodge.
          </h2>
          <p className="text-sm text-white/55 mt-4 leading-relaxed">
            Stock, attendance, events, table bookings and the farmers market —
            in one place, with each role seeing only its own work.
          </p>
        </div>

        <div className="hidden lg:flex items-center gap-2 opacity-40">
          <img src={streamlineLogo} alt="" aria-hidden="true" className="h-[15px] w-auto" />
          <span className="text-[10.5px] font-medium tracking-wide">Built by Streamline</span>
        </div>
      </div>

      {/* The form half. */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-teal mb-2">
            Sign in
          </p>
          <h1 className="text-[27px] font-bold text-navy tracking-[-.02em] leading-tight">
            Welcome back
          </h1>
          <p className="text-sm text-ink-soft mt-2">
            Use the name and password you were given.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Field
              label="Username"
              htmlFor="login-username"
              hint={`Just your name — no need to type ${LOGIN_DOMAIN}`}
            >
              {/* type="text", not "email": the browser's own validation on
                  type="email" rejects a bare "rose" before submit ever runs. */}
              <Inp
                id="login-username"
                type="text"
                required
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                placeholder="rose"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </Field>

            <Field label="Password" htmlFor="login-password">
              <Inp
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </Field>

            {error && (
              <p
                role="alert"
                className="text-sm text-red-700 bg-alert-bg border border-red-200 rounded-lg px-3 py-2.5"
              >
                {error}
              </p>
            )}

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="lg:hidden flex items-center justify-center gap-2 mt-10 opacity-40">
            <img src={streamlineLogo} alt="" aria-hidden="true" className="h-[15px] w-auto" />
            <span className="text-[10.5px] font-medium text-ink tracking-wide">
              Built by Streamline
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
