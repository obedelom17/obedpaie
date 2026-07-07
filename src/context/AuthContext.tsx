import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { authClient } from '../lib/auth-client'

interface OrgInfo { id: string; name: string }
interface UserInfo { id: string; email: string; name?: string }
interface AuthContextType {
  user: UserInfo | null
  org: OrgInfo | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, orgName: string) => Promise<{ error: string | null }>
  signOut: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Récupérer session Better Auth au démarrage
    authClient.getSession().then(({ data }) => {
      if (data?.user) {
        setUser({ id: data.user.id, email: data.user.email, name: data.user.name })
        // Récupérer org depuis localStorage (définie au signup/signin)
        const storedOrg = localStorage.getItem('auth_org')
        if (storedOrg) setOrg(JSON.parse(storedOrg))
        else fetchOrg(data.user.id)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const fetchOrg = async (userId: string) => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setOrg(data.org)
        localStorage.setItem('auth_org', JSON.stringify(data.org))
      }
    } catch {}
  }

  const signIn = async (email: string, password: string) => {
    const { data, error } = await authClient.signIn.email({ email, password })
    if (error) return { error: error.message || 'Erreur de connexion' }
    if (data?.user) {
      setUser({ id: data.user.id, email: data.user.email })
      await fetchOrg(data.user.id)
    }
    return { error: null }
  }

  const signUp = async (email: string, password: string, orgName: string) => {
    try {
      // 1. Créer user + org via notre endpoint custom
      const res = await fetch('/api/auth/signup-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, orgName }),
      })
      const data = await res.json()
      if (!res.ok) return { error: data.error }

      // 2. Connecter
      const { error } = await authClient.signIn.email({ email, password })
      if (error) return { error: error.message }

      const session = await authClient.getSession()
      if (session.data?.user) setUser({ id: session.data.user.id, email: session.data.user.email })
      setOrg(data.org)
      localStorage.setItem('auth_org', JSON.stringify(data.org))
      return { error: null }
    } catch (e: any) { return { error: e.message } }
  }

  const handleSignOut = async () => {
    await authClient.signOut()
    setUser(null); setOrg(null)
    localStorage.removeItem('auth_org')
  }

  return (
    <AuthContext.Provider value={{ user, org, loading, signIn, signUp, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
