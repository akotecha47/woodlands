import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

async function fetchProfile(userId) {
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user?.id) {
        setProfile(await fetchProfile(session.user.id))
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (session?.user?.id) {
          setTimeout(async () => {
            setProfile(await fetchProfile(session.user.id))
          }, 0)
        } else {
          setProfile(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  /**
   * Sign out must actually END the session (U-02).
   *
   * `supabase.auth.signOut()` defaults to a GLOBAL sign-out, which calls the
   * server to revoke every refresh token. When that call fails — an expired or
   * already-revoked refresh token returns 403 session_not_found, and so does an
   * offline browser — the SDK surfaces the error and, in that path, the local
   * session can survive in storage. The user clicks Sign out, sees nothing
   * happen, and is still signed in.
   *
   * So: try the global sign-out, and if it reports an error fall back to a
   * local one, which only clears storage and cannot fail server-side. Either
   * way the local state is cleared here, so RequireAuth redirects on the next
   * render whatever the network did.
   *
   * Nothing else about auth changes: same client, same anon key, same
   * signInWithPassword.
   */
  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) await supabase.auth.signOut({ scope: 'local' })
    } catch {
      try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* storage only */ }
    }
    setSession(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut }}>
      {loading ? (
        <div className="fixed inset-0 flex items-center justify-center bg-paper">
          <div className="w-8 h-8 border-[3px] border-teal border-t-transparent rounded-full animate-spin" />
        </div>
      ) : children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
