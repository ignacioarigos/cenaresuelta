import { createContext, useContext, useState, useEffect } from 'react'
import { sb } from '../lib/supabase'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (u) => {
    const { data } = await sb.from('profiles').select('*').eq('id', u.id).single()
    setProfile(data)
  }

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        loadProfile(session.user).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange(async (_, session) => {
      if (session?.user) {
        setUser(session.user)
        loadProfile(session.user)
      } else {
        setUser(null)
        setProfile(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const logout = async () => {
    await sb.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthCtx.Provider value={{ user, profile, loading, logout, setProfile }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
