import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*, departments(name)')
      .eq('id', userId)
      .single()

    if (!error) return data

    // departments join can fail if the table has restrictive RLS or the FK
    // relationship isn't resolved by PostgREST — fall back to core fields so
    // the role is always returned and auth doesn't break.
    const { data: core } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    return core ?? null
  }

  useEffect(() => {
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (session?.user) {
          const p = await fetchProfile(session.user.id)
          if (!mounted) return

          if (p?.is_active === false) {
            await supabase.auth.signOut()
            return
          }

          setUser(session.user)
          setProfile(p)
        } else {
          setUser(null)
          setProfile(null)
        }

        setLoading(false)
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
